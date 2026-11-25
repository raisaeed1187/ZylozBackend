// Attendance Timesheet: one row per employee per day from
//   saved attendance (StaffAttendance - manual screen, Excel import, earlier timesheet approvals),
//   machine + mobile app punches, and regularizations,
// plus the StaffAttendance_SaveOrUpdate record for each day that can be sent for approval.
//
// The timesheet is the main attendance screen: every day can be regularized.
// Payroll only counts StaffAttendance rows with IsConfirmed = 1; the timesheet sets that
// (through the approval) with the same record the manual screen / Excel import save
// (Frontend: src/pages/Components/Hr/Employee/AttendanceBulkImport.jsx).
//
// States
//   Confirmed         in payroll (IsConfirmed = 1); shown as saved. A regularization makes it a Draft change.
//   Draft             not in payroll yet, can be sent for approval
//   Needs Fix         not in payroll yet, something must be fixed first (miss punch, project, ...)
//   Waiting Approval  sent, waiting for the approver
//   Locked            payroll month or attendance date locked - read only
//   Info              leave day / today not finished - not counted here
//
// Values of a day (first that exists): regularization > saved row > punches > calendar.
// Punches never replace a saved day by themselves.
//
// Overtime (when the day is calculated): worked = out - in - break (Attendance Master);
//   Normal Day OT = worked - working hours (Payroll Configuration); Holiday / Weekly Off OT = worked;
//   rounded DOWN to 0.5 h; only OT-applicable employees. A saved day that is not regularized keeps its OT.
// Holiday = Public Holiday (Payroll Configuration) or the screen's holiday flag;
// Weekly Off = the screen's weekly off or an off day in Payroll Configuration.
// Project of a machine punch = project / location whose name or code matches the machine name.

const EDITABLE_STATUSES = ["active", "probation"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const MISS_PUNCH_AFTER_MIN = 17 * 60; // today before 5 PM (Dubai) one punch = still at work
const UNPAID_LEAVE_CODE = "005";      // created by StaffAttendance_SaveOrUpdate for a Full Day absent

const pad = (n) => String(n).padStart(2, "0");
const norm = (v) => String(v ?? "").trim().toLowerCase();
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const truthy = (v) => v === true || v === 1 || ["1", "true", "yes", "y"].includes(norm(v));
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

// 'YYYY-MM-DD' from a Date (mssql returns DATE as UTC midnight) or a string
function ymd(v) {
  if (!v) return "";
  if (v instanceof Date) return isNaN(v) ? "" : v.toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
}

// 'HH:MM' from '8:05', '08:05:00' or a TIME value (mssql: Date on 1970-01-01 UTC)
function hhmm(v) {
  if (!v) return "";
  if (v instanceof Date) return isNaN(v) ? "" : `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? `${pad(m[1])}:${m[2]}` : "";
}
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmtMin = (mins) => `${pad(Math.floor(mins / 60))}:${pad(Math.round(mins % 60))}`;

// Automatic overtime of a day from In / Out: worked = out - in - break;
// Normal Day: worked - working hours; Holiday / Weekly Off: all worked hours;
// rounded down to 0.5 h; 0 when the employee is not OT-applicable. null = no valid times.
function autoOvertime(inT, outT, breakH, baseDay, otApplicable, workingHours) {
  if (!inT || !outT || toMin(outT) <= toMin(inT)) return null;
  if (!otApplicable) return 0;
  const span = toMin(outT) - toMin(inT);
  const breakMin = Math.round((breakH || 0) * 60);
  const worked = span > breakMin ? span - breakMin : span;
  const ot = baseDay === "Normal Day" ? Math.max(0, worked / 60 - workingHours) : worked / 60;
  return Math.floor(ot * 2) / 2;
}

function dubaiNow() {
  const d = new Date(Date.now() + 4 * 3600 * 1000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function datesBetween(start, end) {
  const out = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}

// Present / Absent / Half Day / '' of a saved row
const statusOf = (row) => {
  if (norm(row.attendanceStatus) === "absent") return norm(row.absentType) === "half day" ? "Half Day" : "Absent";
  return str(row.attendanceStatus) || "";
};
const baseDayOf = (dayStatus) => {
  const d = norm(dayStatus);
  return d.startsWith("holiday") ? "Holiday" : d.startsWith("weekly off") ? "Weekly Off" : "Normal Day";
};

// StaffAttendance row id (column name may be id / Id / ID)
const savedId = (row) => (row ? Number(row.id ?? row.Id ?? row.ID) || 0 : 0);

// Fingerprint of a saved row: submit stores it, apply compares it, so a day changed
// on the manual screen after submitting is not overwritten.
function savedStamp(row) {
  if (!row) return "none";
  const changed = row.changedAt instanceof Date ? row.changedAt.toISOString() : str(row.changedAt);
  return [savedId(row), Number(row.IsConfirmed) || 0, norm(row.attendanceStatus), norm(row.absentType),
    norm(row.dayStatus), hhmm(row.punchIn), hhmm(row.punchOut), changed].join("|");
}

// StaffAttendance rows -> Map('staffId|date' -> latest row)
function savedRowsByKey(rows) {
  const map = new Map();
  (rows || []).forEach((r) => {
    const k = `${r.TsStaffId}|${r.TsDate}`;
    const cur = map.get(k);
    if (!cur || savedId(r) > savedId(cur)) map.set(k, r);
  });
  return map;
}

// Did the timesheet write this saved row (and nobody changed it since)?
function matchesApplied(row, applied) {
  if (!row || !applied) return false;
  const t = (v) => { const x = hhmm(v); return x === "00:00" ? "" : x; }; // absent rows are saved with 00:00
  return norm(row.attendanceStatus) === norm(applied.AttendanceStatus)
    && norm(row.dayStatus) === norm(applied.DayStatus)
    && t(row.punchIn) === t(applied.PunchIn)
    && t(row.punchOut) === t(applied.PunchOut);
}

// StaffAttendance_Get.isLocked went by the CALENDAR month (until Frontend/sql/StaffAttendance_Get_CutoffLock.sql
// is run on the database; after that this check changes nothing). With a payroll cutoff a date can belong
// to the next payroll month (cutoff 25: 26-31 Oct -> November), and then the lock of its calendar
// month does not apply to it. The payroll lock of its own payroll month (IsPayrollLocked,
// cutoff-aware) is always checked as well.
function attendanceDateLocked(sa, date, payMonth) {
  if (!sa?.isLocked) return false;
  const month = ymd(payMonth).slice(0, 7);
  return !month || month === date.slice(0, 7);
}

const projectLabel = (p) => (p ? `${str(p["Contract/Project Code"])} - ${str(p["Contract/Project Name"])}` : "");

/**
 * Lookups shared by all rows.
 *   data        recordsets of usp_Timesheet_GetData
 *   saByDate    Map(date -> Map(staffId -> StaffAttendance_Get item))
 *   masters     StaffAttendanceMaster_Get rows
 *   projects    Attendance_ClientContract_GetList rows
 *   locations   Attendance_ClientContract_Locations rows
 *   holidays    Get_PublicHoliday rows (name, startDate, endDate)
 *   workingDays Get_PayrollWorkingDays rows (day 'Mon', off)
 */
function buildContext({ data, saByDate, masters, projects, locations, holidays, workingDays, projectMode, startDate, endDate }) {
  const [settings, employees, punchDays, regs, applied, pending, leaves, days, empLocks, unlinked, saved] = data;
  const key = (e, d) => `${e}|${d}`;

  const holidayDates = new Map();
  (holidays || []).forEach((h) => {
    const s = ymd(h.startDate), e = ymd(h.endDate) || s;
    if (!s) return;
    datesBetween(s < startDate ? startDate : s, e > endDate ? endDate : e).forEach((d) => holidayDates.set(d, str(h.name)));
  });

  const offWeekdays = new Set(
    (workingDays || []).filter((w) => truthy(w.off)).map((w) => WEEKDAYS.indexOf(norm(w.day).slice(0, 3))).filter((i) => i >= 0)
  );

  const projectsById = new Map((projects || []).map((p) => [String(p.ID2), p]));
  const locationsById = new Map((locations || []).map((l) => [String(l.ID2), l]));

  // machine name -> { project, location }
  const machineCache = new Map();
  const matchMachine = (name) => {
    const n = norm(name);
    if (!n) return null;
    if (machineCache.has(n)) return machineCache.get(n);
    let hit = null;
    const loc = (locations || []).find((l) => norm(l["Location Name"]) === n);
    if (loc) hit = { project: projectsById.get(String(loc.contractId)) || null, location: loc };
    if (!hit) {
      const p = (projects || []).find((x) => norm(x["Contract/Project Name"]) === n || norm(x["Contract/Project Code"]) === n || norm(projectLabel(x)) === n);
      if (p) hit = { project: p, location: null };
    }
    machineCache.set(n, hit);
    return hit;
  };

  return {
    startDate, endDate,
    projectMode: typeof projectMode === "boolean" ? projectMode : null, // Payroll Configuration; null = per day from the screen list
    workingHours: num(settings?.[0]?.WorkingHours) || 8,
    employees: employees || [],
    punch: new Map((punchDays || []).map((r) => [key(r.EmployeeID2, r.AttDate), r])),
    regs: new Map((regs || []).map((r) => [key(r.EmployeeID2, r.AttDate), r])),
    applied: new Map((applied || []).map((r) => [key(r.EmployeeID2, r.AttDate), r])),
    pending: new Map((pending || []).map((r) => [key(r.EmployeeID2, r.AttDate), r])),
    leaves: new Map((leaves || []).filter((r) => str(r.LeaveCode) !== UNPAID_LEAVE_CODE).map((r) => [key(r.EmployeeID2, r.AttDate), r])),
    days: new Map((days || []).map((r) => [r.AttDate, r])),
    empLocks: new Set((empLocks || []).map((r) => key(r.EmployeeID2, r.PayMonth))),
    unlinked: unlinked || [],
    saved: savedRowsByKey(saved),
    saByDate,
    masters: new Map((masters || []).map((m) => [String(m.staffId), m])),
    projectsById, locationsById, holidayDates, offWeekdays, matchMachine, key,
  };
}

function calendarDay(ctx, sa, date) {
  if (ctx.holidayDates.has(date) || norm(sa?.isHoliday) === "yes") return "Holiday";
  const ds = norm(sa?.dayStatus);
  if (ds.startsWith("holiday")) return "Holiday";
  if (ds.startsWith("weekly off") || norm(sa?.IsWeeklyOff) === "yes") return "Weekly Off";
  if (ctx.offWeekdays.has(new Date(`${date}T00:00:00Z`).getUTCDay())) return "Weekly Off";
  return "Normal Day";
}

/** One employee-day, or null when there is nothing to show. */
function buildDay(ctx, emp, date, now) {
  const id = emp.EmployeeID2;
  const k = ctx.key(id, date);
  const sa = ctx.saByDate.get(date)?.get(String(id)) || null;      // screen list (flags, defaults)
  const saved = ctx.saved.get(k) || null;                            // StaffAttendance row
  const pd = ctx.punch.get(k) || null;
  const regRow = ctx.regs.get(k) || null;
  const applied = ctx.applied.get(k) || null;
  const pending = ctx.pending.get(k) || null;
  const leave = ctx.leaves.get(k) || null;
  const day = ctx.days.get(date) || {};

  const confirmed = !!saved && Number(saved.IsConfirmed) === 1;
  // a regularization counts until it has been approved and applied
  const reg = regRow && truthy(regRow.IsPending) ? regRow : null;

  // expected to punch from the first machine / app punch on, after joining
  const usesPunching = !!emp.FirstPunchDate && date >= emp.FirstPunchDate && (!emp.JoiningDate || date >= emp.JoiningDate);
  if (date > now.date) return null;
  if (emp.JoiningDate && date < emp.JoiningDate) return null; // not joined yet
  if (!pd && !regRow && !saved && !pending && !usesPunching) return null;

  const fromTimesheet = !!saved && matchesApplied(saved, applied);
  const savedSource = fromTimesheet ? (applied.Source || "Timesheet") : "Manual";

  const row = {
    key: k,
    employeeID2: id,
    employeeCode: emp.EmployeeCode || sa?.staffCode || "",
    employeeName: emp.EmployeeName || sa?.staffName || "",
    designation: sa?.designation || "",
    date,
    payMonth: day.PayMonth || null,
    dayStatus: "",
    status: "",
    punchIn: "",
    punchOut: "",
    punchCount: pd?.PunchCount || 0,
    workedMinutes: null,
    breakTime: "",
    normalOT: 0, holidayOT: 0, weeklyOT: 0,
    source: "",
    machineName: pd?.MachineName || "",
    appLocation: pd?.AppLocation || "",
    projectID: "", projectName: "", locationId: "", locationName: "",
    leaveCode: leave?.LeaveCode || "",
    regularization: regRow ? {
      inTime: regRow.InTime ? hhmm(regRow.InTime) : "", outTime: regRow.OutTime ? hhmm(regRow.OutTime) : "",
      dayStatus: regRow.DayStatus || "", attendanceStatus: regRow.AttendanceStatus || "",
      projectId: regRow.ProjectId || "", locationId: regRow.LocationId || "",
      overtime: regRow.OvertimeHours == null ? "" : num(regRow.OvertimeHours),
      reason: regRow.Reason || "", remarks: regRow.Remarks || "", changedBy: regRow.ChangedBy || "", changedAt: regRow.ChangedAt || "",
      isPending: !!reg,
    } : null,
    raw: pd ? { firstIn: pd.FirstIn || "", lastOut: pd.LastOut || "", methods: pd.Methods || "" } : null,
    saved: saved ? (() => {
      const st = statusOf(saved);
      const i = hhmm(saved.punchIn), o = hhmm(saved.punchOut);
      const times = st === "Present" && i && i !== o;
      return { status: st || str(saved.dayStatus), dayStatus: str(saved.dayStatus), punchIn: times ? i : "", punchOut: times ? o : "", confirmed, source: savedSource };
    })() : null,
    isConfirmed: confirmed,
    inPayroll: confirmed,
    state: "",
    canApply: false,
    canRegularize: true,
    issues: [],
    record: null,
  };

  const fillProjectNames = () => {
    row.projectName = row.projectName || str(ctx.projectsById.get(String(row.projectID))?.["Contract/Project Name"]);
    row.locationName = str(ctx.locationsById.get(String(row.locationId))?.["Location Name"]);
  };
  const punchNote = () => {
    if (pd) row.issues.push(`Punches ${pd.FirstIn || "--"} - ${pd.LastOut || "--"} (${pd.PunchCount}, ${pd.HasMachine && pd.HasApp ? "Machine + App" : pd.HasApp ? "App" : "Machine"})`);
  };

  const payrollLocked = truthy(day.IsPayrollLocked) || ctx.empLocks.has(ctx.key(id, day.PayMonth));
  const dateLocked = attendanceDateLocked(sa, date, day.PayMonth);

  /* ---------- confirmed and not being changed: show as saved ---------- */
  if (confirmed && !reg && !pending) {
    row.source = savedSource;
    row.dayStatus = str(saved.dayStatus);
    row.status = statusOf(saved);
    row.punchIn = hhmm(saved.punchIn);
    row.punchOut = hhmm(saved.punchOut);
    if (row.punchIn && row.punchOut && toMin(row.punchOut) > toMin(row.punchIn)) {
      const breakMin = Math.round((num(saved.breakTime) || 0) * 60);
      const span = toMin(row.punchOut) - toMin(row.punchIn);
      row.workedMinutes = span > breakMin ? span - breakMin : span;
    }
    row.breakTime = str(saved.breakTime);
    row.normalOT = num(saved.normalOT) || 0;
    row.holidayOT = num(saved.holidayOT) || 0;
    row.weeklyOT = num(saved.weeklyOT) || 0;
    row.autoOT = autoOvertime(row.punchIn, row.punchOut,
      num(ctx.masters.get(String(id))?.breakTime) ?? num(saved.breakTime) ?? 0,
      baseDayOf(saved.dayStatus), truthy(sa?.isOTapplicable), ctx.workingHours);
    row.projectID = str(saved.projectId ?? saved.projectID); row.projectName = str(saved.projectName); row.locationId = str(saved.locationId);
    fillProjectNames();
    if (payrollLocked || dateLocked) {
      row.state = "Locked";
      row.canRegularize = false;
      row.issues.push(payrollLocked ? "In payroll - payroll of this month is locked" : "In payroll - attendance of this date is locked");
    } else {
      row.state = "Confirmed";
      row.issues.push(`In payroll (${savedSource})`);
    }
    punchNote();
    return row;
  }

  /* ---------- calculate: regularization > saved row > punches > calendar ---------- */
  const blockers = [];
  const wh = ctx.workingHours;
  const master = ctx.masters.get(String(id));
  const breakH = num(master?.breakTime) ?? num(saved?.breakTime) ?? num(sa?.breakTime) ?? 0;

  // base values
  const savedStatus = saved ? statusOf(saved) : "";
  const base = saved
    ? { in: savedStatus === "Present" ? hhmm(saved.punchIn) : "", out: savedStatus === "Present" ? hhmm(saved.punchOut) : "", fromPunches: false }
    : { in: pd?.FirstIn || "", out: pd && pd.PunchCount > 1 ? pd.LastOut || "" : "", fromPunches: !!pd };
  if (!base.fromPunches && base.in === base.out) { base.in = ""; base.out = ""; } // saved 00:00 - 00:00 = no times

  const calendar = saved?.dayStatus ? baseDayOf(saved.dayStatus) : calendarDay(ctx, sa, date);
  let dayStatus = reg?.DayStatus || calendar;
  const baseDay = baseDayOf(dayStatus);

  const regIn = reg?.InTime ? hhmm(reg.InTime) : "";
  const regOut = reg?.OutTime ? hhmm(reg.OutTime) : "";
  let inT = regIn || base.in;
  let outT = regOut || base.out;
  // one punch + one regularized time: the punch is the other side
  if (base.fromPunches && pd?.PunchCount === 1) {
    if (regIn && !regOut && pd.FirstIn > regIn) outT = pd.FirstIn;
    if (regOut && !regIn) inT = pd.FirstIn < regOut ? pd.FirstIn : "";
  }
 
  const regStatus = reg?.AttendanceStatus || "";
  let status;
  if (regStatus === "Absent" || regStatus === "Half Day") status = regStatus;
  else if (inT && outT) status = "Present";
  else if (inT || outT) status = date === now.date && now.minutes < MISS_PUNCH_AFTER_MIN ? "In Progress" : "Miss Punch";
  else if (regStatus === "Present") status = "Miss Punch";
  else if (savedStatus === "Absent" || savedStatus === "Half Day") status = savedStatus;
  else if (savedStatus === "Present") status = baseDay !== "Normal Day" ? baseDay : "Miss Punch"; // saved without times
  else if (leave) status = "On Leave";
  else if (baseDay !== "Normal Day") status = baseDay;
  else status = date === now.date ? "No Punch Yet" : "Absent";

  let attendanceStatus = "", absentType = "", punchIn = "", punchOut = "", breakTime = "0", total = "00:00";
  let normalOT = 0, holidayOT = 0, weeklyOT = 0;
  // a saved day that is not regularized keeps its own OT / day status (as entered)
  const keepSaved = !!saved && !reg;

  if (status === "Present") {
    if (toMin(outT) <= toMin(inT)) {
      blockers.push("Out time is before In time - regularize");
    } else {
      const span = toMin(outT) - toMin(inT);
      const breakMin = Math.round(breakH * 60);
      const worked = span > breakMin ? span - breakMin : span;
      row.workedMinutes = worked;
      punchIn = inT; punchOut = outT; breakTime = String(span > breakMin ? breakH : 0); total = fmtMin(worked);
      attendanceStatus = "Present";
      row.autoOT = autoOvertime(inT, outT, breakH, baseDay, truthy(sa?.isOTapplicable), wh);
      if (keepSaved) {
        dayStatus = str(saved.dayStatus) || dayStatus;
        normalOT = num(saved.normalOT) || 0; holidayOT = num(saved.holidayOT) || 0; weeklyOT = num(saved.weeklyOT) || 0;
        breakTime = str(saved.breakTime) || breakTime;
        total = str(saved.totalWorkingHours) || total;
      } else { 
        const otApplicable = truthy(sa?.isOTapplicable);
        // overtime set by hand in the regularization wins over the calculated one
        const otOverride = reg && reg.OvertimeHours != null ? num(reg.OvertimeHours) : null;
        const autoOt = row.autoOT ?? 0; // what In / Out give, shown in the regularize popup
        let ot;
        if (otOverride !== null) {
          ot = otOverride;
          if (ot > 0 && !otApplicable) blockers.push("Overtime is not applicable for this employee - set overtime to 0");
          if (ot > worked / 60) row.issues.push(`Overtime ${ot} h is more than the ${fmtMin(worked)} worked`);
        } else {
          ot = autoOt;
        }
        row.otSetByHand = otOverride !== null;
        if (!reg?.DayStatus) dayStatus = ot > 0 && baseDay === "Holiday" ? "Holiday OT" : ot > 0 && baseDay === "Weekly Off" ? "Weekly Off OT" : baseDay;
        if (dayStatus === "Normal Day") normalOT = ot;
        else if (dayStatus === "Holiday OT") holidayOT = ot;
        else if (dayStatus === "Weekly Off OT") weeklyOT = ot;
      }
    } 
    if (leave) row.issues.push(`Worked on a leave day (leave ${leave.LeaveCode || ""})`);
  } else if (status === "Absent" || status === "Half Day") {
    if (baseDay !== "Normal Day") blockers.push("Absent / Half Day only on a Normal Day - regularize the day status");
    dayStatus = "Normal Day";
    attendanceStatus = "Absent";
    absentType = status === "Half Day" ? "Half Day" : "Full Day";
  } else if (status === "Holiday" || status === "Weekly Off") {
    // same as the manual screen / import for a holiday or weekly off without work
    const s = saved || sa;
    attendanceStatus = norm(s?.attendanceStatus) === "absent" ? "" : str(s?.attendanceStatus);
  } else if (status === "Miss Punch") {
    blockers.push(regStatus === "Present" || savedStatus === "Present" ? "Enter In and Out time" : "Miss punch - regularize In / Out time");
  }

  /* project / location: regularization > machine name > app project > saved row / screen */
  const projectMode = ctx.projectMode ?? norm(sa?.projectLocationAttendance) === "yes";
  let projectID = str(saved ? (saved.projectId ?? saved.projectID) : sa?.projectID);
  let projectName = str(saved ? saved.projectName : sa?.projectName);
  let locationId = str(saved ? saved.locationId : sa?.locationId);
  const setProject = (p) => {
    if (!p || String(p.ID2) === projectID) return;
    projectID = String(p.ID2);
    projectName = str(p["Contract/Project Name"]);
    const own = [...ctx.locationsById.values()].filter((l) => String(l.contractId) === projectID);
    if (!own.some((l) => String(l.ID2) === locationId)) locationId = own.length === 1 ? String(own[0].ID2) : "";
  };
  const machine = pd?.MachineName ? ctx.matchMachine(pd.MachineName) : null;
  const usePunchProject = !saved; // a saved day keeps its project unless regularized
  if (reg?.ProjectId) setProject(ctx.projectsById.get(String(reg.ProjectId)));
  else if (usePunchProject && machine?.project) setProject(machine.project);
  else if (usePunchProject && pd?.AppProjectId) setProject(ctx.projectsById.get(String(pd.AppProjectId)));
  if (reg?.LocationId) locationId = String(reg.LocationId);
  else if (usePunchProject && !reg?.ProjectId && machine?.location && (!projectMode || String(machine.location.contractId) === projectID)) locationId = String(machine.location.ID2);
  if (usePunchProject && pd?.MachineName && !machine) row.issues.push(`Machine "${pd.MachineName}" does not match a project / location name`);

  // source label
  const punchSource = pd ? (pd.HasMachine && pd.HasApp ? "Machine + App" : pd.HasApp ? "App" : "Machine") : "";
  row.source = reg ? "Regularized" : saved ? savedSource : punchSource || "No Punch";

  row.dayStatus = dayStatus;
  row.status = status;
  row.punchIn = punchIn || inT;
  row.punchOut = punchOut || outT;
  row.breakTime = punchIn ? breakTime : "";
  row.normalOT = normalOT; row.holidayOT = holidayOT; row.weeklyOT = weeklyOT;
  row.projectID = projectID; row.projectName = projectName; row.locationId = locationId;
  fillProjectNames();

  if (!sa) blockers.push("Employee is not in the attendance list of this date (status / joining date)");
  else if (!EDITABLE_STATUSES.includes(norm(sa.employeeStatus))) blockers.push(`Employee status is "${sa.employeeStatus || "-"}"`);
  if (projectMode && attendanceStatus && (!projectID || !locationId)) blockers.push("Project and Location are required - regularize to set them");

  const record = {
    id: savedId(saved),
    staffId: id,
    IsConfirmed: 1,
    staffName: sa?.staffName || str(saved?.staffName) || row.employeeName,
    designation: sa?.designation || str(saved?.designation),
    projectID, projectName, locationId,
    punchIn, punchOut,
    normalOT, holidayOT, weeklyOT,
    totalWorkingHours: total,
    attendanceStatus,
    attendanceDate: date,
    dayStatus,
    // the manual screen deletes the absent leave when a Full Day absent is undone
    isLeaveDelete: savedStatus === "Absent" && !(attendanceStatus === "Absent" && absentType === "Full Day"),
    breakTime,
    absentType: absentType || str(saved?.absentType) || str(sa?.absentType) || "Full Day",
    _savedStamp: savedStamp(saved),
  };

  if (pending) {
    row.state = "Waiting Approval";
    row.canRegularize = false;
    row.pendingWith = pending.PendingWith || "";
    row.pendingDelegate = pending.PendingDelegate || "";
    row.pendingLevel = pending.PendingLevel || null;
    row.totalLevels = pending.TotalLevels || null;
    const level = pending.PendingLevel ? ` (level ${pending.PendingLevel}${pending.TotalLevels ? ` of ${pending.TotalLevels}` : ""})` : "";
    row.issues.unshift(
      pending.PendingWith
        ? `Pending with ${pending.PendingWith}${pending.PendingDelegate ? ` / delegate ${pending.PendingDelegate}` : ""}${level}`
        : `Sent for approval${pending.CreatedBy ? ` by ${pending.CreatedBy}` : ""}`
    );
  } else if (payrollLocked || dateLocked) {
    row.state = "Locked";
    row.canRegularize = false;
    row.issues.unshift(payrollLocked ? "Payroll of this month is locked" : "Attendance of this date is locked");
  } else if (["On Leave", "In Progress", "No Punch Yet"].includes(status)) {
    row.state = "Info";
    row.issues.unshift(status === "On Leave" ? `On leave (${leave.LeaveCode || "leave"}) - paid by leave` : status === "In Progress" ? "Day not finished" : "No punch yet today");
  } else if (blockers.length) {
    row.state = "Needs Fix";
    row.issues.unshift(...blockers);
  } else {
    row.state = "Draft";
    row.canApply = true;
    row.record = record;
    if (confirmed) row.issues.unshift(`Change to confirmed attendance (in payroll now: ${row.saved.status}${row.saved.punchIn ? ` ${row.saved.punchIn} - ${row.saved.punchOut}` : ""}) - payroll keeps it until approved`);
    else if (saved) row.issues.unshift("Saved on the manual screen, not confirmed");
  }
  if (!saved || reg) punchNote();
  return row;
}

function buildTimesheet(input) {
  const ctx = buildContext(input);
  const now = dubaiNow();
  const dates = datesBetween(input.startDate, input.endDate);
  const rows = [];
  for (const emp of ctx.employees) {
    for (const date of dates) {
      const r = buildDay(ctx, emp, date, now);
      if (r) rows.push(r);
    }
  }
  rows.sort((a, b) => (a.employeeName || "").localeCompare(b.employeeName || "") || a.date.localeCompare(b.date));

  const count = (f) => rows.filter(f).length;
  const summary = {
    employees: new Set(rows.map((r) => r.employeeID2)).size,
    days: rows.length,
    confirmed: count((r) => r.state === "Confirmed"),
    draft: count((r) => r.state === "Draft"),
    needsFix: count((r) => r.state === "Needs Fix"),
    waiting: count((r) => r.state === "Waiting Approval"),
    locked: count((r) => r.state === "Locked"),
    info: count((r) => r.state === "Info"),
    present: count((r) => r.status === "Present"),
    absent: count((r) => r.status === "Absent" || r.status === "Half Day"),
    missPunch: count((r) => r.status === "Miss Punch"),
    regularized: count((r) => !!r.regularization?.isPending),
    otHours: rows.reduce((s, r) => s + r.normalOT + r.holidayOT + r.weeklyOT, 0),
    workingHours: ctx.workingHours,
    projectMode: ctx.projectMode ?? [...ctx.saByDate.values()].some((m) => [...m.values()].some((x) => norm(x.projectLocationAttendance) === "yes")),
    unlinkedMachinePeople: ctx.unlinked.length,
  };
  return { rows, summary, unlinked: ctx.unlinked };
}

module.exports = { buildTimesheet, datesBetween, hhmm, norm, truthy, matchesApplied, attendanceDateLocked, savedId, savedStamp, savedRowsByKey, EDITABLE_STATUSES };
