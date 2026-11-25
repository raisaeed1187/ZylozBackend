// Attendance Timesheet: Manual + Mobile App + Machine attendance in one screen,
// regularization, and "Apply to Payroll" through the approval engine.
// SQL: Frontend/sql/Attendance_Timesheet.sql
// Row rules: helper/attendanceTimesheet.js
//
// Payroll is not changed: approved days are saved with the existing
// StaffAttendance_SaveOrUpdate (same bindings as /attendance/save-update and
// /attendance/bulk-import), IsConfirmed = 1, which is what Payroll_Calculate reads.

const sql = require("mssql");
const store = require("../../store");
const { setCurrentDatabase, setCurrentUser } = require("../../constents").actions;
const { buildTimesheet, attendanceDateLocked, norm, savedId, savedStamp, savedRowsByKey, EDITABLE_STATUSES } = require("../../helper/attendanceTimesheet");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_FETCH_CONCURRENCY = 4;
const MAX_SUBMIT_LINES = 3000;

function connectUserDb(req) {
  store.dispatch(setCurrentDatabase(req.authUser.database));
  store.dispatch(setCurrentUser(req.authUser));
  return sql.connect(store.getState().constents.config);
}

const formatTime = (time) => {
  if (!time) return "";
  return time.length === 5 ? `${time}:00` : time;
};

const ymd = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v || "").slice(0, 10));

// StaffAttendance_Get for every date (the list the Employee Attendance screen loads)
async function loadStaffAttendance(pool, organizationId, dates) {
  const byDate = new Map();
  let next = 0;
  const worker = async () => {
    while (next < dates.length) {
      const date = dates[next++];
      const result = await pool.request()
        .input("date", sql.NVarChar(20), date)
        .input("org", sql.NVarChar(65), organizationId)
        .query("exec StaffAttendance_Get @date, 0, @org");
      const map = new Map();
      (result.recordset || []).forEach((item) => {
        if (item.staffId != null && !map.has(String(item.staffId))) map.set(String(item.staffId), item);
      });
      byDate.set(date, map);
    }
  };
  await Promise.all(Array.from({ length: Math.min(DAY_FETCH_CONCURRENCY, dates.length) }, worker));
  return byDate;
}

async function resolvePeriod(pool, body) {
  const { organizationId, payMonth, startDate, endDate } = body;
  if (DATE_RE.test(startDate || "") && DATE_RE.test(endDate || "")) {
    return { startDate, endDate, payMonth: null };
  }
  if (!DATE_RE.test(payMonth || "")) throw new Error("Select a payroll month or a period.");
  const r = await pool.request()
    .input("org", sql.NVarChar(65), organizationId)
    .input("month", sql.Date, payMonth)
    .query("SELECT PeriodStart = CONVERT(CHAR(10), PeriodStart, 23), PeriodEnd = CONVERT(CHAR(10), PeriodEnd, 23) FROM dbo.fn_PayrollPeriod(@org, @month)");
  const p = r.recordset[0];
  if (!p) throw new Error("Could not find the payroll period.");
  return { startDate: p.PeriodStart, endDate: p.PeriodEnd, payMonth };
}

async function loadTimesheet(pool, req, organizationId, startDate, endDate) {
  const tenantId = req.authUser.tenantId;

  const data = await pool.request()
    .input("TenantId", sql.NVarChar(65), tenantId)
    .input("OrganizationId", sql.NVarChar(65), organizationId)
    .input("StartDate", sql.Date, startDate)
    .input("EndDate", sql.Date, endDate)
    .execute("usp_Timesheet_GetData");

  const [masters, projects, locations, holidays, workingDays, payrollConfig] = await Promise.all([
    pool.request().input("org", sql.NVarChar(65), organizationId).query("exec StaffAttendanceMaster_Get Null, @org"),
    pool.request().input("org", sql.NVarChar(65), organizationId).query("exec Attendance_ClientContract_GetList @org"),
    pool.request().query("exec Attendance_ClientContract_Locations '0'"),
    pool.request().query("exec Get_PublicHoliday"),
    pool.request().query("exec Get_PayrollWorkingDays"),
    pool.request().query("exec Get_PayrollConfiguration"),
  ]);

  // Payroll Configuration > Project/Location Applicable
  const projectSetting = payrollConfig.recordset?.[0]?.projectLocationAttendanceApplicable;
  const projectMode = projectSetting == null ? null : norm(projectSetting) === "yes";

  const dates = data.recordsets[7].map((d) => d.AttDate);
  const saByDate = await loadStaffAttendance(pool, organizationId, dates);

  const built = buildTimesheet({
    data: data.recordsets,
    saByDate,
    masters: masters.recordset,
    projects: projects.recordset,
    locations: locations.recordset,
    holidays: holidays.recordset,
    workingDays: workingDays.recordset,
    projectMode,
    startDate,
    endDate,
  });

  return {
    ...built,
    projectMode: projectMode ?? built.summary.projectMode,
    projects: (projects.recordset || []).map((p) => ({ ID2: p.ID2, code: p["Contract/Project Code"], name: p["Contract/Project Name"] })),
    locations: (locations.recordset || []).map((l) => ({ ID2: l.ID2, name: l["Location Name"], contractId: l.contractId })),
  };
}

// POST /api/attendance/timesheet  { organizationId, payMonth | startDate+endDate }
const getTimesheet = async (req, res) => {
  try {
    const { organizationId } = req.body;
    if (!organizationId) return res.status(400).json({ message: "Select an organization." });
    const pool = await connectUserDb(req);
    const period = await resolvePeriod(pool, req.body);
    const ts = await loadTimesheet(pool, req, organizationId, period.startDate, period.endDate);
    res.status(200).json({ message: "Timesheet loaded", data: { ...ts, period } });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/attendance/timesheet/regularize
const saveRegularization = async (req, res) => {
  try {
    const b = req.body;
    if (!b.employeeID2 || !DATE_RE.test(b.date || "")) return res.status(400).json({ message: "Employee and date are required." });
    // overtime set by hand: hours (2.5) or H:MM (2:30); empty = calculated from In / Out
    let overtime = null;
    if (b.overtime !== undefined && b.overtime !== null && String(b.overtime).trim() !== "") {
      const v = String(b.overtime).trim();
      const m = v.match(/^(\d{1,2}):(\d{2})$/);
      overtime = m ? Number(m[1]) + Number(m[2]) / 60 : Number(v);
      if (!Number.isFinite(overtime) || overtime < 0 || overtime > 24) {
        return res.status(400).json({ message: "Overtime must be hours between 0 and 24 (e.g. 2, 2.5 or 2:30)." });
      }
      overtime = Math.round(overtime * 100) / 100;
    }
    const pool = await connectUserDb(req);
    const result = await pool.request()
      .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
      .input("EmployeeID2", sql.NVarChar(65), b.employeeID2)
      .input("AttDate", sql.Date, b.date)
      .input("InTime", sql.VarChar(8), b.inTime || null)
      .input("OutTime", sql.VarChar(8), b.outTime || null)
      .input("DayStatus", sql.NVarChar(30), b.dayStatus || null)
      .input("AttendanceStatus", sql.NVarChar(20), b.attendanceStatus || null)
      .input("ProjectId", sql.NVarChar(65), b.projectId || null)
      .input("LocationId", sql.NVarChar(65), b.locationId || null)
      .input("Reason", sql.NVarChar(255), b.reason || null)
      .input("Remarks", sql.NVarChar(500), b.remarks || null)
      .input("User", sql.NVarChar(100), req.authUser.username)
      .input("Remove", sql.Bit, b.remove ? 1 : 0)
      .input("OvertimeHours", sql.Decimal(5, 2), overtime)
      .execute("usp_Timesheet_SaveRegularization");
    const row = result.recordset[0];
    if (!row?.Success) return res.status(400).json({ message: row?.Message || "Regularization failed." });
    res.status(200).json({ message: row.Message, data: null });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/attendance/timesheet/regularization-history { employeeID2, date }
const getRegularizationHistory = async (req, res) => {
  try {
    const { employeeID2, date } = req.body;
    const pool = await connectUserDb(req);
    const result = await pool.request()
      .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
      .input("Emp", sql.NVarChar(65), employeeID2)
      .input("Date", sql.Date, date)
      .query(`SELECT Action, InTime, OutTime, DayStatus, AttendanceStatus, ProjectId, LocationId, OvertimeHours, Reason, Remarks, ActionBy,
                     ActionAt = CONVERT(VARCHAR(16), ActionAt, 120)
              FROM dbo.AttendanceRegularizationLog
              WHERE TenantId = @TenantId AND EmployeeID2 = @Emp AND AttDate = @Date
              ORDER BY Id DESC`);
    res.status(200).json({ message: "History loaded", data: result.recordset });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/attendance/timesheet/submit { organizationId, startDate, endDate, keys: ['empId|date'], remarks }
// Rows are built again here; only days that can be applied now are submitted.
const submitTimesheet = async (req, res) => {
  try {
    const { organizationId, startDate, endDate, keys, remarks } = req.body;
    if (!organizationId || !DATE_RE.test(startDate || "") || !DATE_RE.test(endDate || "")) {
      return res.status(400).json({ message: "Organization and period are required." });
    }
    if (!Array.isArray(keys) || keys.length === 0) return res.status(400).json({ message: "Select at least one day." });
    if (keys.length > MAX_SUBMIT_LINES) return res.status(400).json({ message: `Maximum ${MAX_SUBMIT_LINES} days per batch.` });

    const pool = await connectUserDb(req);
    const ts = await loadTimesheet(pool, req, organizationId, startDate, endDate);
    const wanted = new Set(keys);
    const picked = ts.rows.filter((r) => wanted.has(r.key));
    const ready = picked.filter((r) => r.canApply);
    const notReady = picked.filter((r) => !r.canApply).map((r) => ({ key: r.key, employeeCode: r.employeeCode, date: r.date, reason: r.issues[0] || r.state }));
    const missing = keys.length - picked.length;

    if (ready.length === 0) {
      return res.status(400).json({ message: "None of the selected days can be applied. Reload the timesheet.", data: { notReady } });
    }

    const lines = ready.map((r) => ({
      employeeID2: r.employeeID2, employeeCode: r.employeeCode, employeeName: r.employeeName,
      attDate: r.date, payMonth: r.payMonth,
      dayStatus: r.record.dayStatus, attendanceStatus: r.record.attendanceStatus, absentType: r.record.attendanceStatus === "Absent" ? r.record.absentType : null,
      punchIn: r.record.punchIn || null, punchOut: r.record.punchOut || null, breakTime: r.record.breakTime,
      totalWorkingHours: r.record.totalWorkingHours,
      normalOT: r.record.normalOT, holidayOT: r.record.holidayOT, weeklyOT: r.record.weeklyOT,
      projectId: r.record.projectID || null, projectName: r.record.projectName || null, locationId: r.record.locationId || null,
      source: r.source, machineName: r.machineName || null, isRegularized: !!r.regularization,
      record: r.record,
    }));

    const result = await pool.request()
      .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
      .input("OrganizationId", sql.NVarChar(65), organizationId)
      .input("PeriodStart", sql.Date, startDate)
      .input("PeriodEnd", sql.Date, endDate)
      .input("Lines", sql.NVarChar(sql.MAX), JSON.stringify(lines))
      .input("CreatedBy", sql.NVarChar(100), req.authUser.username)
      .input("Remarks", sql.NVarChar(500), remarks || null)
      .execute("usp_Timesheet_SubmitBatch");

    const batch = result.recordset[0];
    res.status(200).json({
      message: `${batch.LineCount} day(s) sent for approval.`,
      data: { batchId: batch.BatchId, submitted: batch.LineCount, notReady, missing },
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/attendance/timesheet/batches { organizationId, statusId? }
const getTimesheetBatches = async (req, res) => {
  try {
    const { organizationId, statusId } = req.body;
    const pool = await connectUserDb(req);
    const result = await pool.request()
      .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
      .input("OrganizationId", sql.NVarChar(65), organizationId)
      .input("UserId", sql.NVarChar(100), req.authUser.ID2 || null)
      .input("UserName", sql.NVarChar(100), req.authUser.username || null)
      .input("StatusId", sql.Int, parseInt(statusId, 10) || null)
      .execute("usp_Timesheet_GetBatches");
    res.status(200).json({ message: "Batches loaded", data: result.recordset });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

async function getBatchLines(pool, req, batchId) {
  const result = await pool.request()
    .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
    .input("BatchId", sql.NVarChar(65), batchId)
    .execute("usp_Timesheet_GetBatchLines");
  return { header: result.recordsets[0][0], lines: result.recordsets[1], saved: savedRowsByKey(result.recordsets[2]) };
}

// POST /api/attendance/timesheet/batch-lines { batchId }
const getTimesheetBatchLines = async (req, res) => {
  try {
    const pool = await connectUserDb(req);
    const { header, lines } = await getBatchLines(pool, req, req.body.batchId);
    res.status(200).json({ message: "Batch loaded", data: { header, lines: lines.map(({ RecordJson, ...l }) => l) } });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

async function markLine(requestFactory, req, lineId, status, message) {
  await requestFactory()
    .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
    .input("LineId", sql.Int, lineId)
    .input("LineStatus", sql.NVarChar(20), status)
    .input("Message", sql.NVarChar(500), message ? String(message).slice(0, 500) : null)
    .input("User", sql.NVarChar(100), req.authUser.username)
    .execute("usp_Timesheet_MarkLine");
}

// Applies the Pending / Failed lines of an approved batch (StatusId 2).
async function applyBatch(pool, req, batchId) {
  const { header, lines, saved } = await getBatchLines(pool, req, batchId);
  if (!header || header.StatusId !== 2) throw new Error("Only an approved batch can be applied.");

  const todo = lines.filter((l) => l.LineStatus === "Pending" || l.LineStatus === "Failed");
  const dates = [...new Set(todo.map((l) => ymd(l.AttDate)))];
  const saByDate = await loadStaffAttendance(pool, header.OrganizationId, dates);

  const appliedMonths = new Set();
  const counts = { applied: 0, skipped: 0, failed: 0 };

  for (const line of todo) {
    const date = ymd(line.AttDate);
    const sa = saByDate.get(date)?.get(String(line.EmployeeID2)) || null;
    const savedRow = saved.get(`${line.EmployeeID2}|${date}`) || null;
    const record = JSON.parse(line.RecordJson);
    let skip = null;
    if (!sa) skip = "Employee is not in the attendance list of this date";
    else if (attendanceDateLocked(sa, date, line.PayMonth)) skip = "Attendance of this date is locked";
    else if (!EDITABLE_STATUSES.includes(norm(sa.employeeStatus))) skip = `Employee status is "${sa.employeeStatus || "-"}"`;
    else if (line.IsPayrollLocked) skip = "Payroll of this month is locked";
    // the saved day must be the one the approver saw (not changed on the manual screen since)
    else if (record._savedStamp && record._savedStamp !== savedStamp(savedRow)) {
      skip = "Attendance of this day was changed on the manual screen after it was submitted - review and submit again";
    }

    if (skip) {
      await markLine(() => pool.request(), req, line.LineId, "Skipped", skip);
      counts.skipped++;
      continue;
    }

    record.id = savedId(savedRow);   // update the saved row, or 0 = new row
    record.staffName = sa.staffName || record.staffName;
    record.designation = sa.designation || record.designation;

    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();
      // same bindings as attendanceSaveUpdate / attendanceBulkImport
      await new sql.Request(transaction)
        .input("id", sql.Int, record.id || 0)
        .input("staffId", sql.NVarChar(65), record.staffId)
        .input("IsConfirmed", sql.Int, 1)
        .input("staffName", sql.NVarChar(100), record.staffName)
        .input("designation", sql.NVarChar(50), record.designation)
        .input("projectName", sql.NVarChar(200), record.projectName)
        .input("punchIn", sql.NVarChar(50), formatTime(record.punchIn))
        .input("punchOut", sql.NVarChar(50), formatTime(record.punchOut))
        .input("normalOT", sql.Decimal(5, 2), record.normalOT)
        .input("holidayOT", sql.Decimal(5, 2), record.holidayOT)
        .input("weeklyOT", sql.Decimal(5, 2), record.weeklyOT)
        .input("attendanceStatus", sql.NVarChar(20), record.attendanceStatus)
        .input("attendanceDate", sql.Date, record.attendanceDate)
        .input("dayStatus", sql.NVarChar(100), record.dayStatus)
        .input("isLeaveDelete", sql.Bit, record.isLeaveDelete)
        .input("breakTime", sql.NVarChar(100), record.breakTime ? String(record.breakTime) : "")
        .input("totalWorkingHours", sql.NVarChar(100), record.totalWorkingHours)
        .input("absentType", sql.NVarChar(100), record.absentType)
        .input("changedBy", sql.NVarChar(100), req.authUser.username)
        .input("projectId", sql.NVarChar(65), record.projectID)
        .input("locationId", sql.NVarChar(65), record.locationId)
        .input("TenantId", sql.NVarChar(100), req.authUser.tenantId)
        .execute("dbo.StaffAttendance_SaveOrUpdate");
      await markLine(() => new sql.Request(transaction), req, line.LineId, "Applied", "Applied to attendance");
      await transaction.commit();
      counts.applied++;
      if (line.PayMonth) appliedMonths.add(ymd(line.PayMonth));
    } catch (err) {
      try { await transaction.rollback(); } catch (e) { /* already rolled back */ }
      try { await markLine(() => pool.request(), req, line.LineId, "Failed", err.message); } catch (e) { /* keep going */ }
      counts.failed++;
    }
  }

  const finish = await pool.request()
    .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
    .input("BatchId", sql.NVarChar(65), batchId)
    .execute("usp_Timesheet_FinishBatch");

  // same refresh as the employee bulk import / transfer; locked months are skipped by the proc
  let payrollWarning = null;
  for (const month of appliedMonths) {
    try {
      await pool.request()
        .input("month", sql.NVarChar(20), month)
        .input("user", sql.NVarChar(250), req.authUser.username)
        .input("org", sql.NVarChar(65), header.OrganizationId)
        .input("tenant", sql.NVarChar(100), req.authUser.tenantId)
        .query("EXEC Save_PayrollOutput @month, @user, @org, @tenant");
    } catch (err) {
      console.error("Save_PayrollOutput after timesheet apply failed:", err);
      payrollWarning = `Attendance was applied, but the payroll refresh failed: ${err.message}`;
    }
  }

  return { ...counts, batch: finish.recordset[0], payrollWarning };
}

// Approve / Reject one level; at the final approval the days are applied.
// Shared by the timesheet screen and the dashboard approvals (approvalInboxController).
async function processTimesheetBatchAction(pool, req, { batchId, action, remarks }) {
  const result = await pool.request()
    .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
    .input("BatchId", sql.NVarChar(65), batchId)
    .input("Action", sql.NVarChar(20), action)
    .input("UserName", sql.NVarChar(100), req.authUser.username)
    .input("Remarks", sql.NVarChar(500), remarks || null)
    .execute("usp_Timesheet_ProcessBatch");
  const r = result.recordset[0];

  if (r.StatusId !== 2) return { message: r.Message, data: { statusId: r.StatusId } };

  const applied = await applyBatch(pool, req, batchId);
  return {
    message: `Approved. ${applied.applied} applied, ${applied.skipped} skipped, ${applied.failed} failed.`,
    data: { statusId: applied.batch?.StatusId, ...applied },
  };
}

// POST /api/attendance/timesheet/batch-action { batchId, action: 'Approve' | 'Reject', remarks }
const timesheetBatchAction = async (req, res) => {
  try {
    const { batchId, action, remarks } = req.body;
    if (!["Approve", "Reject"].includes(action)) return res.status(400).json({ message: "Action must be Approve or Reject." });
    if (action === "Reject" && !String(remarks || "").trim()) return res.status(400).json({ message: "Enter a reason for rejecting." });

    const pool = await connectUserDb(req);
    res.status(200).json(await processTimesheetBatchAction(pool, req, { batchId, action, remarks }));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/attendance/timesheet/batch-apply { batchId } - retry the failed lines of an approved batch
const timesheetBatchApply = async (req, res) => {
  try {
    const pool = await connectUserDb(req);
    const applied = await applyBatch(pool, req, req.body.batchId);
    res.status(200).json({
      message: `${applied.applied} applied, ${applied.skipped} skipped, ${applied.failed} failed.`,
      data: { statusId: applied.batch?.StatusId, ...applied },
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getTimesheet,
  saveRegularization,
  getRegularizationHistory,
  submitTimesheet,
  getTimesheetBatches,
  getTimesheetBatchLines,
  timesheetBatchAction,
  timesheetBatchApply,
  processTimesheetBatchAction,
};
