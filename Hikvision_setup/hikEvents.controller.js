// src/controllers/hikEvents.controller.js
// Receives Hikvision HTTP Listening pushes and stores them via usp_Hik_IngestEvent.
// Adjust the db import to match your project (pool/getPool helper).

const sql = require('mssql');
const { getPool } = require('../config/db'); // <-- your existing pool helper

/** Pull the event JSON out of whatever shape the device sent. */
function extractEvent(req) {
  const body = req.body || {};

  // Multipart form field (your device uses "AccessControllerEvent")
  let raw = body.AccessControllerEvent ?? body.event_log ?? null;

  // Some firmware posts plain JSON instead of multipart
  if (!raw && req.is('application/json') && body.eventType) raw = body;
  if (!raw) return null;

  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function receiveEvent(req, res) {
  const { token } = req.params;

  let evt;
  try {
    evt = extractEvent(req);
  } catch (err) {
    // Malformed payload will not improve on retry -> acknowledge and log
    console.warn('[hik] bad payload', err.message);
    return res.status(200).send('OK');
  }

  // Heartbeats / empty posts
  if (!evt) return res.status(200).send('OK');

  const ac = evt.AccessControllerEvent || {};

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('Token',          sql.VarChar(64),     token)
      .input('DeviceSerial',   sql.VarChar(50),     evt.shortSerialNumber ?? null)
      .input('EventType',      sql.VarChar(50),     evt.eventType ?? null)
      .input('MajorEventType', sql.Int,             ac.majorEventType ?? null)
      .input('SubEventType',   sql.Int,             ac.subEventType ?? null)
      .input('SerialNo',       sql.Int,             ac.serialNo ?? null)
      .input('EmpNo',          sql.VarChar(30),     ac.employeeNoString ?? null)
      .input('EmpName',        sql.NVarChar(100),   ac.name ?? null)
      .input('PunchTime',      sql.VarChar(40),     evt.dateTime ?? null)
      .input('VerifyMode',     sql.VarChar(50),     ac.currentVerifyMode ?? null)
      .input('AttStatus',      sql.VarChar(20),     ac.attendanceStatus ?? null)
      .input('RawJson',        sql.NVarChar(sql.MAX), JSON.stringify(evt))
      .execute('dbo.usp_Hik_IngestEvent');

    const outcome = result.recordset?.[0]?.Result;
    if (outcome === 'Inserted') {
      console.log(`[hik] punch ${ac.employeeNoString} @ ${evt.dateTime} (serial ${ac.serialNo})`);
    }

    // 200 only AFTER the row is safely stored -> device removes it from its retry queue
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[hik] ingest failed', err);
    // Non-200 -> device keeps the event and retries later
    return res.status(500).send('ERROR');
  }
}

module.exports = { receiveEvent };
