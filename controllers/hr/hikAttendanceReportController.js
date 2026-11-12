// Machine Attendance Report (Hikvision punches in HikAttRawPunch).
// SQL: sql/Hik_Attendance_1_Rename.sql, then sql/Hik_Attendance_2_Setup.sql

const sql = require("mssql");
const store = require("../../store");
const { setCurrentDatabase, setCurrentUser } = require("../../constents").actions;

// Same database selection as the other attendance screens: the logged-in user's.
// The tenant is set on every query by helper/db/dbRuntime.js.
function connectUserDb(req) {
  store.dispatch(setCurrentDatabase(req.authUser.database));
  store.dispatch(setCurrentUser(req.authUser));
  return sql.connect(store.getState().constents.config);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseFilters(body = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = DATE_RE.test(body.startDate || "") ? body.startDate : today;
  const endDate = DATE_RE.test(body.endDate || "") ? body.endDate : startDate;
  const pageNumber = Math.max(parseInt(body.pageNumber, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(body.pageSize, 10) || 50, 1), 500);
  const deviceId = parseInt(body.deviceId, 10) || null;
  const search = (body.search || "").trim() || null;
  return { startDate, endDate, pageNumber, pageSize, deviceId, search };
}

function pagination(rows, pageNumber, pageSize) {
  const totalRows = rows[0]?.TotalRows ?? 0;
  return { totalRows, pageNumber, pageSize, totalPages: Math.max(Math.ceil(totalRows / pageSize), 1) };
}

// POST /api/attendance/machine/summary
const getMachineAttendanceSummary = async (req, res) => {
  try {
    const pool = await connectUserDb(req);
    const f = parseFilters(req.body);

    const result = await pool.request()
      .input("TenantId",  sql.NVarChar(65), req.authUser.tenantId)
      .input("StartDate", sql.Date,         f.startDate)
      .input("EndDate",   sql.Date,         f.endDate)
      .input("DeviceId",  sql.Int,          f.deviceId)
      .execute("usp_HikAtt_GetSummary");

    res.status(200).json({ message: "Summary loaded", data: result.recordset[0] ?? {} });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/attendance/machine/daily
const getMachineAttendanceDaily = async (req, res) => {
  try {
    const pool = await connectUserDb(req);
    const f = parseFilters(req.body);
    const status = ["Present", "MissPunch", "Absent"].includes(req.body.status) ? req.body.status : null;

    const result = await pool.request()
      .input("TenantId",   sql.NVarChar(65),  req.authUser.tenantId)
      .input("StartDate",  sql.Date,          f.startDate)
      .input("EndDate",    sql.Date,          f.endDate)
      .input("Search",     sql.NVarChar(100), f.search)
      .input("DeviceId",   sql.Int,           f.deviceId)
      .input("Status",     sql.VarChar(20),   status)
      .input("PageNumber", sql.Int,           f.pageNumber)
      .input("PageSize",   sql.Int,           f.pageSize)
      .execute("usp_HikAtt_GetDaily");

    const rows = result.recordset;
    res.status(200).json({ message: "Daily attendance loaded", data: rows, pagination: pagination(rows, f.pageNumber, f.pageSize) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/attendance/machine/punches
const getMachineAttendancePunches = async (req, res) => {
  try {
    const pool = await connectUserDb(req);
    const f = parseFilters(req.body);
    const verifyMinor = [75, 38, 1].includes(Number(req.body.verifyMinor)) ? Number(req.body.verifyMinor) : null;

    const result = await pool.request()
      .input("TenantId",    sql.NVarChar(65),  req.authUser.tenantId)
      .input("StartDate",   sql.Date,          f.startDate)
      .input("EndDate",     sql.Date,          f.endDate)
      .input("EmpNo",       sql.VarChar(30),   req.body.empNo || null)
      .input("Search",      sql.NVarChar(100), f.search)
      .input("DeviceId",    sql.Int,           f.deviceId)
      .input("VerifyMinor", sql.Int,           verifyMinor)
      .input("PageNumber",  sql.Int,           f.pageNumber)
      .input("PageSize",    sql.Int,           f.pageSize)
      // popup: one person's punches (machine + app); PersonKey from the Daily row
      .input("PersonKey",   sql.NVarChar(100), String(req.body.personKey || "").trim() || null)
      .execute("usp_HikAtt_GetPunches");

    const rows = result.recordset;
    res.status(200).json({ message: "Punches loaded", data: rows, pagination: pagination(rows, f.pageNumber, f.pageSize) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/attendance/machine/devices
const getMachineAttendanceDevices = async (req, res) => {
  try {
    const pool = await connectUserDb(req);
    const f = parseFilters(req.body);

    const result = await pool.request()
      .input("TenantId",  sql.NVarChar(65), req.authUser.tenantId)
      .input("StartDate", sql.Date,         f.startDate)
      .input("EndDate",   sql.Date,         f.endDate)
      .execute("usp_HikAtt_GetDevices");

    res.status(200).json({ message: "Devices loaded", data: result.recordset });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/attendance/machine/employee-search   { search }
// Employees to pick from in the "Link to system employee" popup.
const searchMachineLinkEmployees = async (req, res) => {
  try {
    const pool = await connectUserDb(req);
    const search = String(req.body.search || "").trim() || null;

    const result = await pool.request()
      .input("TenantId", sql.NVarChar(65),  req.authUser.tenantId)
      .input("Search",   sql.NVarChar(100), search)
      .execute("usp_HikAtt_SearchEmployees");

    res.status(200).json({ message: "Employees loaded", data: result.recordset });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// POST /api/attendance/machine/link-employee   { employeeId2, hikPersonId, reassign }
// hikPersonId = device person ID to link; null/empty = unlink the employee.
// reassign = true ("Change"): move the ID away from the employee who has it now.
const linkMachineEmployee = async (req, res) => {
  try {
    const employeeId2 = String(req.body.employeeId2 || "").trim();
    const hikPersonId = req.body.hikPersonId == null ? null : String(req.body.hikPersonId).trim() || null;

    if (!employeeId2) return res.status(400).json({ message: "Employee is required." });
    if (hikPersonId && hikPersonId.length > 30) return res.status(400).json({ message: "Device ID is too long (max 30)." });

    const pool = await connectUserDb(req);
    await pool.request()
      .input("TenantId",    sql.NVarChar(65), req.authUser.tenantId)
      .input("EmployeeID2", sql.NVarChar(65), employeeId2)
      .input("HikPersonId", sql.VarChar(30),  hikPersonId)
      .input("Reassign",    sql.Bit,          req.body.reassign === true)
      .execute("usp_Employee_SetHikPersonId");

    res.status(200).json({
      message: hikPersonId ? "Employee linked to device ID " + hikPersonId : "Employee unlinked",
      data: { employeeId2, hikPersonId },
    });
  } catch (error) {
    // usp_Employee_SetHikPersonId THROWs readable messages (already linked / not found)
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  searchMachineLinkEmployees,
  linkMachineEmployee,
  getMachineAttendanceSummary,
  getMachineAttendanceDaily,
  getMachineAttendancePunches,
  getMachineAttendanceDevices,
};
