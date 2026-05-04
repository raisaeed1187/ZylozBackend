/**
 * Attendance Controller — Production
 * Handles: enroll, checkIn, checkOut, getLogs, getReport
 */

const sql        = require("mssql");
const axios      = require("axios");
const FormData   = require("form-data");
const { v4: uuidv4 } = require("uuid");
const store      = require("../store");
const { setTenantContext } = require("../helper/db/sqlTenant");
require("dotenv").config(); 

const { setCurrentDatabase, setCurrentUser } = require("../constents").actions;

const FACE_API        = process.env.FACE_API_URL || "http://127.0.0.1:8001";
const FACE_API_TOKEN  = process.env.FACE_API_TOKEN || "";
const COSINE_MAX_DIST = parseFloat(process.env.COSINE_MAX_DIST || "0.38");
const COOLDOWN_MINS   = parseInt(process.env.COOLDOWN_MINS || "2", 10);
const MAX_ENROLL_IMGS = parseInt(process.env.MAX_ENROLL_IMGS || "5", 10);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cosineDistance(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function faceApiHeaders() {
  return FACE_API_TOKEN
    ? { Authorization: `Bearer ${FACE_API_TOKEN}` }
    : {};
}

async function extractEmbedding(base64Image) {
  const buffer = Buffer.from(base64Image, "base64");
  const form   = new FormData();
  form.append("file", buffer, { filename: "face.jpg", contentType: "image/jpeg" });

  const res = await axios.post(`${FACE_API}/extract`, form, {
    headers: { ...form.getHeaders(), ...faceApiHeaders() },
    maxBodyLength: Infinity,
    timeout: 15_000,
  });

  return res.data; // { success, embedding, quality_score, message }
}

async function checkLiveness(base64Image) {
  // console.log('inside liveness check');
  const buffer = Buffer.from(base64Image, "base64");
  const form   = new FormData();
  form.append("file", buffer, { filename: "face.jpg", contentType: "image/jpeg" });

  const res = await axios.post(`${FACE_API}/liveness`, form, {
    headers: { ...form.getHeaders(), ...faceApiHeaders() },
    maxBodyLength: Infinity,
    timeout: 10_000,
  });

  return res.data; // { is_live, score, message }
}

function initDb(formData, req= null) {

  if (formData.client) {
    store.dispatch(setCurrentDatabase(formData.client || "allbiz"));
    store.dispatch(setCurrentUser(formData.authUser || "System"));
    return store.getState().constents.config;
    
  }else{
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser)); 
    const config = store.getState().constents.config;   
    return config;
  }

}

// ─── Enroll ──────────────────────────────────────────────────────────────────

const enroll = async (req, res) => {
  const { name, employeeCode,ID2, department = "", images, client } = req.body;

  if (!name || !employeeCode) {
    return res.status(400).json({ message: "name and employeeCode are required", data: null });
  }
  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ message: "At least one image is required", data: null });
  }

  const imageSlice = images.slice(0, MAX_ENROLL_IMGS);

  try {
    const config = initDb(req.body, req);
    const pool   = await sql.connect(config);

    // Check for duplicate employee code
    const existing = await pool.request()
      .input("code", sql.NVarChar, employeeCode)
      .query("SELECT EmployeeId FROM AttendanceEmployees WHERE EmployeeCode = @code AND IsActive = 1");

    if (existing.recordset.length > 0) {
      return res.status(400).json({
        message: `Employee code '${employeeCode}' already registered`,
        data: null,
      });
    }

    // Insert employee
    const result = await pool.request()
      .input("name",       sql.NVarChar, name)
      .input("code",       sql.NVarChar, employeeCode)
      .input("dept",       sql.NVarChar, department)
      .input("id2",        sql.NVarChar, ID2)
      .query(`
        INSERT INTO AttendanceEmployees (Name, EmployeeCode, Department,EmployeeID2, IsActive, CreatedAt)
        OUTPUT INSERTED.EmployeeId
        VALUES (@name, @code, @dept, @id2, 1, GETDATE())
      `);

    const employeeId = result.recordset[0].EmployeeId;

    let enrolledCount = 0;
    const errors = [];

    for (const base64 of imageSlice) {
      try {
        const aiRes = await extractEmbedding(base64);

        if (!aiRes.success) {
          errors.push(aiRes.message || "Extraction failed");
          continue;
        }

        await pool.request()
          .input("empId",   sql.Int,            employeeId)
          .input("emb",     sql.NVarChar(sql.MAX), JSON.stringify(aiRes.embedding))
          .input("quality", sql.Float,           aiRes.quality_score || 0)
          .input("id2",        sql.NVarChar, ID2) 
          .query(`
            INSERT INTO FaceEmbeddings (EmployeeId,EmployeeID2, Embedding, QualityScore, CreatedAt)
            VALUES (@empId, @id2, @emb, @quality, GETDATE())
          `);

        enrolledCount++;
      } catch (embErr) {
        errors.push(embErr.message);
      }
    }

    if (enrolledCount === 0) {
      // Rollback: remove the employee record since no embeddings were stored
      await pool.request()
        .input("id", sql.Int, employeeId)
        .query("DELETE FROM AttendanceEmployees WHERE EmployeeId = @id");

      return res.status(400).json({
        message: "No valid face embeddings could be extracted",
        data: { errors },
      });
    }

    const data = [
        {
        employeeId,
        employeeID2: ID2,
        employeeName: name,
        employeeCode: employeeCode,
        embeddingsStored: enrolledCount,
        warnings: errors.length > 0 ? errors : undefined,
      }
    ];

    return res.status(200).json({
      message: "Employee enrolled successfully",
      data:data ,
    });
  } catch (err) {
    console.error("[enroll] Error:", err.message);
    return res.status(400).json({ message: err.message, data: null });
  }
};

// ─── Check In ────────────────────────────────────────────────────────────────

const checkIn = async (req, res) => {
  const { imageBase64, client, location = null } = req.body;
  // console.log('inside checkIn');

  if (!imageBase64) {
    return res.status(400).json({ message: "imageBase64 is required", data: null });
  }

  try {
    const config = initDb(req.body, req);
    const pool   = await sql.connect(config);
    // await setTenantContext(pool,req);


    // console.log('imageBase64');
    // console.log(imageBase64);

    // 1. Liveness check
    const liveness = await checkLiveness(imageBase64);
    if (!liveness.is_live) {
      return res.status(400).json({
        message: `Liveness check failed: ${liveness.message}`,
        data: { livenessScore: liveness.score },
      });
    }

    // 2. Extract embedding
    const aiRes = await extractEmbedding(imageBase64);
    if (!aiRes.success) {
      return res.status(400).json({ message: aiRes.message || "Face not detected", data: null });
    }

    const inputEmb = aiRes.embedding;

    // 3. Load all embeddings (paginated for large tenants)
    const rows = await pool.request().query(`
      SELECT e.EmployeeId, e.Name, e.EmployeeCode, f.Embedding
      FROM   AttendanceEmployees e
      JOIN   FaceEmbeddings f ON e.EmployeeId = f.EmployeeId
      WHERE  e.IsActive = 1
    `);

    // 4. Find best match
    let best    = null;
    let minDist = 999;

    for (const r of rows.recordset) {
      let stored;
      try { stored = JSON.parse(r.Embedding); } catch { continue; }

      const dist = cosineDistance(inputEmb, stored);
      if (dist < COSINE_MAX_DIST && dist < minDist) {
        minDist = dist;
        best    = r;
      }
    }

    if (!best) {
      return res.status(400).json({ message: "No matching employee found", data: null });
    }

    // 5. Cooldown check
    const lastLog = await pool.request()
      .input("empId", sql.Int, best.EmployeeId)
      .query(`
        SELECT TOP 1 LogTime, Type
        FROM   AttendanceLogs
        WHERE  EmployeeId = @empId
        ORDER  BY LogTime DESC
      `);

    if (lastLog.recordset.length > 0) {
      const last        = new Date(lastLog.recordset[0].LogTime);
      const diffMinutes = (Date.now() - last.getTime()) / 60_000;

      // if (diffMinutes < COOLDOWN_MINS) {
      //   // return res.status(429).json({
      //   //   message: `Already marked ${Math.floor(diffMinutes)} minute(s) ago. Please wait.`,
      //   //   data: { employee: best.Name, lastType: lastLog.recordset[0].Type },
      //   // });
      //   return res.status(400).json({
      //     message: `Already marked ${Math.floor(diffMinutes)} minute(s) ago. Please wait.`,
      //     data: { employee: best.Name, lastType: lastLog.recordset[0].Type },
      //   });
      // }
      
    }

    // 6. Determine IN / OUT toggle
    const lastType  = lastLog.recordset[0]?.Type;
    const logType   = lastType === "IN" ? "OUT" : "IN";

    // 7. Write attendance log
    const logResult = await pool.request()
      .input("empId",    sql.Int,      best.EmployeeId)
      .input("type",     sql.NVarChar, logType)
      .input("location", sql.NVarChar, location)
      .input("confidence", sql.Float,  parseFloat((1 - minDist).toFixed(4)))
      .query(`
        INSERT INTO AttendanceLogs (EmployeeId, Type, Location, Confidence, LogTime)
        OUTPUT INSERTED.LogId
        VALUES (@empId, @type, @location, @confidence, GETUTCDATE())
      `);

    const data = [
      {
        logId:      logResult.recordset[0].LogId,
        employee:   best.Name,
        employeeCode: best.EmployeeCode,
        type:       logType,
        confidence: parseFloat((1 - minDist).toFixed(4)),
        timestamp:  new Date().toISOString(),
      }
    ];

    return res.status(200).json({
      message: `${logType === "IN" ? "Checked in" : "Checked out"} successfully`,
      data: data,
    });
  } catch (err) {
    console.error("[checkIn] Error:", err.message);
    return res.status(400).json({ message: err.message, data: null });
  }
};

// ─── Get Logs ─────────────────────────────────────────────────────────────────

const getLogs = async (req, res) => {
  const { date, employeeCode, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const config = initDb(req.body, req);
    const pool   = await sql.connect(config);

    let where = "WHERE 1=1";
    const request = pool.request()
      .input("limit",  sql.Int, parseInt(limit))
      .input("offset", sql.Int, offset);

    if (date) {
      where += " AND CAST(l.LogTime AS DATE) = @date";
      request.input("date", sql.Date, date);
    }
    if (employeeCode) {
      where += " AND e.EmployeeCode = @code";
      request.input("code", sql.NVarChar, employeeCode);
    }

    const result = await request.query(`
      SELECT  l.LogId, e.Name, e.EmployeeCode, e.Department,
              l.Type, l.LogTime, l.Location, l.Confidence
      FROM    AttendanceLogs l
      JOIN    AttendanceEmployees e ON l.EmployeeId = e.EmployeeId
      ${where}
      ORDER   BY l.LogTime DESC
      OFFSET  @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    const countResult = await pool.request().query(`
      SELECT COUNT(*) AS total
      FROM   AttendanceLogs l
      JOIN   AttendanceEmployees e ON l.EmployeeId = e.EmployeeId
      ${where.replace(/@date/g, "'" + (date || "") + "'").replace(/@code/g, "'" + (employeeCode || "") + "'")}
    `);

    return res.status(200).json({
      message: "Logs retrieved",
      data: {
        logs:    result.recordset,
        total:   countResult.recordset[0].total,
        page:    parseInt(page),
        limit:   parseInt(limit),
      },
    });
  } catch (err) {
    console.error("[getLogs] Error:", err.message);
    return res.status(500).json({ message: err.message, data: null });
  }
};

// ─── Daily Report ─────────────────────────────────────────────────────────────

const getDailyReport = async (req, res) => {
  const { date = new Date().toISOString().slice(0, 10) } = req.query;

  try {
    const config = initDb(req.body, req);
    const pool   = await sql.connect(config);

    const result = await pool.request()
      .input("date", sql.Date, date)
      .query(`
        SELECT
          e.EmployeeCode,
          e.Name,
          e.Department,
          MIN(CASE WHEN l.Type='IN'  THEN l.LogTime END) AS CheckIn,
          MAX(CASE WHEN l.Type='OUT' THEN l.LogTime END) AS CheckOut,
          DATEDIFF(MINUTE,
            MIN(CASE WHEN l.Type='IN'  THEN l.LogTime END),
            MAX(CASE WHEN l.Type='OUT' THEN l.LogTime END)
          ) AS WorkMinutes
        FROM AttendanceEmployees e
        LEFT JOIN AttendanceLogs l
          ON e.EmployeeId = l.EmployeeId AND CAST(l.LogTime AS DATE) = @date
        WHERE e.IsActive = 1
        GROUP BY e.EmployeeCode, e.Name, e.Department
        ORDER BY e.Name
      `);

    return res.status(200).json({
      message: "Daily report generated",
      data: { date, employees: result.recordset },
    });
  } catch (err) {
    console.error("[getDailyReport] Error:", err.message);
    return res.status(500).json({ message: err.message, data: null });
  }
};


const getAttendanceSummary = async (req, res) => {  
    const {date} = req.body; 
      
    try {
         
        const config = initDb(req.body, req); 

        const pool = await sql.connect(config);  
         
        await setTenantContext(pool,req);
 
       
        const apiResponse = await pool.request() 
          .input('Date', sql.NVarChar(65),  date) 
          .input('TenantId', sql.NVarChar(65), req?.authUser?.tenantId || null) 
          .execute('usp_Attendance_GetDailySummary');
  
        const stringData = apiResponse.recordset.map(row => {
          const newRow = {};
          for (const key in row) {
            newRow[key] = row[key] !== null && row[key] !== undefined
              ? String(row[key])
              : '';
          }
          return newRow;
        });


        res.status(200).json({
            message: `Dashbaord summary loaded successfully!`,
            data: stringData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAttendanceSummary

const getAttendanceStatusWiseDetails = async (req, res) => {  
    const {date,status} = req.body; 
      
    try {
         
        const config = initDb(req.body, req); 

        const pool = await sql.connect(config);  
         
        await setTenantContext(pool,req);
 
       
        const apiResponse = await pool.request() 
          .input('Date', sql.NVarChar(65),  date) 
          .input('Status', sql.NVarChar(65),  status) 
          .input('TenantId', sql.NVarChar(65), req?.authUser?.tenantId) 
          .execute('usp_Attendance_GetDrillDown');
  
        const stringData = apiResponse.recordset.map(row => {
          const newRow = {};
          for (const key in row) {
            newRow[key] = row[key] !== null && row[key] !== undefined
              ? String(row[key])
              : '';
          }
          return newRow;
        });

        res.status(200).json({
            message: `Status ${status} details  loaded successfully!`,
            data: stringData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAttendanceStatusWiseDetails

const getAttendanceEnrolledEmployees = async (req, res) => {  
    const {date,status} = req.body; 
      
    try {
         
        const config = initDb(req.body, req); 

        const pool = await sql.connect(config);  
         
        await setTenantContext(pool,req);
 
       
        const apiResponse = await pool.request()  
          .input('TenantId', sql.NVarChar(65), req?.authUser?.tenantId) 
          .execute('usp_Attendance_GetEnrollmentStatus');
  
        const stringData = apiResponse.recordset.map(row => {
          const newRow = {};
          for (const key in row) {
            newRow[key] = row[key] !== null && row[key] !== undefined
              ? String(row[key])
              : '';
          }
          return newRow;
        });


        res.status(200).json({
            message: `Enrolled employees   loaded successfully!`,
            data: stringData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAttendanceEnrolledEmployees

const getAttendancePendingEnrollmentEmployees = async (req, res) => {  
    const {date,status} = req.body; 
      
    try {
         
        const config = initDb(req.body, req); 

        const pool = await sql.connect(config);  
         
        await setTenantContext(pool,req);
 
       
        const apiResponse = await pool.request()  
          .input('TenantId', sql.NVarChar(65), req?.authUser?.tenantId) 
          .execute('usp_Attendance_GetPendingEnrollment');
  
        const stringData = apiResponse.recordset.map(row => {
          const newRow = {};
          for (const key in row) {
            newRow[key] = row[key] !== null && row[key] !== undefined
              ? String(row[key])
              : '';
          }
          return newRow;
        });


        res.status(200).json({
            message: `Pending enrollment employees  loaded successfully!`,
            data: stringData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAttendancePendingEnrollmentEmployees

const getAttendanceEmployeeTimeline = async (req, res) => {  
    const {date,employeeId,status} = req.body; 
      
    try {
         
        const config = initDb(req.body, req); 

        const pool = await sql.connect(config);  
         
        await setTenantContext(pool,req);
 
       
        const apiResponse = await pool.request()  
          .input('EmployeeId', sql.NVarChar(65), employeeId) 
          .input('Date', sql.NVarChar(65), date) 
          .input('TenantId', sql.NVarChar(65), req?.authUser?.tenantId) 

          .execute('usp_Attendance_GetEmployeeTimeline');
  
        const stringData = apiResponse.recordset.map(row => {
          const newRow = {};
          for (const key in row) {
            newRow[key] = row[key] !== null && row[key] !== undefined
              ? String(row[key])
              : '';
          }
          return newRow;
        });


        res.status(200).json({
            message: `Employee timeline details  loaded successfully!`,
            data: stringData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAttendanceEmployeeTimeline

const saveFingerprintTemplate = async (req, res) => {
  const { 
    employeeId2,
    employeeCode,
    fingerIndex,
    fingerLabel,
    template
  } = req.body;

  try {
    const config = initDb(req.body, req);
    const pool = await sql.connect(config);

    await setTenantContext(pool, req);

    const result = await pool.request() 
      .input('EmployeeId2', sql.NVarChar(65), employeeId2)
      .input('EmployeeCode', sql.NVarChar(40), employeeCode)
      .input('FingerIndex', sql.TinyInt, fingerIndex)
      .input('FingerLabel', sql.NVarChar(20), fingerLabel)
      .input('Template', sql.NVarChar(sql.MAX), template)
      .input('TenantId', sql.NVarChar(65), req?.authUser?.tenantId)
      .execute('usp_Fingerprint_SaveTemplate');

    const response = result.recordset[0];

    res.status(200).json({
      success: response.ResultCode === 0,
      limitReached: response.ResultCode === 1,
      message: response.Message
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
// end of saveFingerprintTemplate

const getEmployeeFingers = async (req, res) => {
  const { employeeId } = req.body;

  try {
    const config = initDb(req.body, req);
    const pool = await sql.connect(config);

    await setTenantContext(pool, req);

    const result = await pool.request()
      .input('EmployeeId', sql.NVarChar(65), employeeId)
      .input('TenantId', sql.NVarChar(65), req?.authUser?.tenantId)
      .execute('usp_Fingerprint_GetByEmployee');

    res.status(200).json({
      success: true,
      data: result.recordset
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
// end of getEmployeeFingers

const deleteFinger = async (req, res) => {
  const { employeeId, fingerIndex } = req.body;

  try {
    const config = initDb(req.body, req);
    const pool = await sql.connect(config);

    await setTenantContext(pool, req);

    const result = await pool.request()
      .input('EmployeeId', sql.NVarChar(65), employeeId)
      .input('FingerIndex', sql.TinyInt, fingerIndex)
      .input('TenantId', sql.NVarChar(65), req?.authUser?.tenantId)
      .execute('usp_Fingerprint_DeleteOne');

    res.status(200).json({
      success: result.recordset[0].DeletedRows > 0
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
// end of deleteFinger

const deleteAllFingers = async (req, res) => {
  const { employeeId } = req.body;

  try {
    const config = initDb(req.body, req);
    const pool = await sql.connect(config);

    await setTenantContext(pool, req);

    const result = await pool.request()
      .input('EmployeeId', sql.NVarChar(65), employeeId)
      .input('TenantId', sql.NVarChar(65), req?.authUser?.tenantId)
      .execute('usp_Fingerprint_DeleteAllForEmployee');

    res.status(200).json({
      success: true,
      deleted: result.recordset[0].DeletedRows
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};
// end of deleteAllFingers

const logFingerprintPunch = async (req, res) => {
  const {
    employeeId,
    employeeCode,
    confidence,
    fingerIndex
  } = req.body;

  try {
    const config = initDb(req.body, req);
    const pool = await sql.connect(config);

    await setTenantContext(pool, req);

    const result = await pool.request()
      .input('EmployeeID2', sql.NVarChar(65), employeeId)
      .input('EmployeeCode', sql.NVarChar(40), employeeCode)
      .input('TenantId', sql.NVarChar(65), req?.authUser?.tenantId)
      .input('Confidence', sql.Float, confidence)
      .input('FingerIndex', sql.TinyInt, fingerIndex)
      .execute('usp_Fingerprint_LogPunch');

    res.status(200).json({
      message: "Punch logged",
      data: result.recordset[0]
    });

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
// end of logFingerprintPunch

const getPendingFingerprintEnrollments = async (req, res) => {
  try {
    const config = initDb(req.body, req);
    const pool = await sql.connect(config);

    await setTenantContext(pool, req);

    const result = await pool.request()
      .input('TenantId', sql.NVarChar(65), req?.authUser?.tenantId)
      .execute('usp_Fingerprint_PendingEnrollment');

    res.status(200).json({
      message: "Pending enrollments loaded",
      data: result.recordset
    });

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
// end of getPendingFingerprintEnrollments

const getAllFingerprintTemplates = async (req, res) => {
  try {
    const config = initDb(req.body, req);
    const pool = await sql.connect(config);

    await setTenantContext(pool, req);

    const result = await pool.request()
      .input('TenantId', sql.NVarChar(65), req?.authUser?.tenantId)
      .execute('usp_Fingerprint_GetAllTemplates');

    res.status(200).json({
      message: "Templates loaded",
      data: result.recordset
    });

  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
// end of getAllFingerprintTemplates

module.exports = { enroll, checkIn, getLogs, getDailyReport, getAttendanceSummary, getAttendanceEnrolledEmployees, getAttendancePendingEnrollmentEmployees, getAttendanceStatusWiseDetails, 
  getAttendanceEmployeeTimeline, saveFingerprintTemplate, getEmployeeFingers, deleteFinger, deleteAllFingers,
  logFingerprintPunch, getAllFingerprintTemplates, getPendingFingerprintEnrollments


};
