// Receives Hikvision HTTP Listening pushes and stores them via usp_Hik_IngestEvent.
// SQL: Hikvision_setup/01_hik_attendance.sql, then sql/Hik_Attendance_Patch.sql

const sql = require("mssql");
require("dotenv").config();

// The device sends no JWT, so there is no user to take the database from, and
// store.getState().constents.config holds the database of whoever logged in
// last. The push database is therefore fixed here. sql.connect() reuses the
// pool of that database (helper/db/dbRuntime.js).
function hikDbConfig() {
  return {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.HIK_DATABASE || process.env.DB_DATABASE,
    options: {
      trustServerCertificate: true,
      trustedConnection: false,
      enableArithAbort: true,
      encrypt: true,
    },
  };
}

/** Pull the event JSON out of whatever shape the device sent. */
function extractEvent(req) {
  const body = req.body || {};

  // Plain JSON post: the body is the whole event, and its AccessControllerEvent
  // key is only the nested details, so check for the envelope first.
  if (body.eventType) return body;

  // Multipart form field (the device uses "AccessControllerEvent")
  const raw = body.AccessControllerEvent ?? body.event_log ?? null;
  if (!raw) return null;

  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function receiveEvent(req, res) {
  const { token } = req.params;

  let evt;
  try {
    evt = extractEvent(req);
  } catch (err) {
    // Malformed payload will not improve on retry -> acknowledge and log
    console.warn("[hik] bad payload", err.message);
    return res.status(200).send("OK");
  }

  // Heartbeats / empty posts
  if (!evt) return res.status(200).send("OK");

  const ac = evt.AccessControllerEvent || {};

  try {
    const pool = await sql.connect(hikDbConfig());
    const result = await pool.request()
      .input("Token",          sql.VarChar(64),       token)
      .input("DeviceSerial",   sql.VarChar(50),       evt.shortSerialNumber ?? null)
      .input("EventType",      sql.VarChar(50),       evt.eventType ?? null)
      .input("MajorEventType", sql.Int,               ac.majorEventType ?? null)
      .input("SubEventType",   sql.Int,               ac.subEventType ?? null)
      .input("SerialNo",       sql.Int,               ac.serialNo ?? null)
      .input("EmpNo",          sql.VarChar(30),       ac.employeeNoString ?? null)
      .input("EmpName",        sql.NVarChar(100),     ac.name ?? null)
      .input("PunchTime",      sql.VarChar(40),       evt.dateTime ?? null)
      .input("VerifyMode",     sql.VarChar(50),       ac.currentVerifyMode ?? null)
      .input("AttStatus",      sql.VarChar(20),       ac.attendanceStatus ?? null)
      .input("RawJson",        sql.NVarChar(sql.MAX), JSON.stringify(evt))
      .execute("dbo.usp_Hik_IngestEvent");

    const outcome = result.recordset?.[0]?.Result;
    if (outcome === "Inserted") {
      console.log(`[hik] punch ${ac.employeeNoString} @ ${evt.dateTime} (serial ${ac.serialNo})`);
    } else if (outcome === "UnknownDevice") {
      console.warn(`[hik] unknown device or token (serial ${evt.shortSerialNumber})`);
    }

    // 200 only AFTER the row is safely stored -> device removes it from its retry queue
    return res.status(200).send("OK");
  } catch (err) {
    console.error("[hik] ingest failed", err);
    // Non-200 -> device keeps the event and retries later
    return res.status(500).send("ERROR");
  }
}

module.exports = { receiveEvent };
