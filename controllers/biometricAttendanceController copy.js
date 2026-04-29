const sql = require("mssql");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config(); 
const store = require('../store'); 
const { setCurrentDatabase,setCurrentUser } = require('../constents').actions;
const fs = require("fs");
const crypto = require('crypto');
const multer = require("multer");
const { BlobServiceClient } = require("@azure/storage-blob"); 
const constentsSlice = require("../constents");
const { setTenantContext } = require("../helper/db/sqlTenant");  
const FormData = require("form-data");
const axios = require("axios");



const SECRET_KEY = process.env.SECRET_KEY;

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "documents";
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);


const FACE_API = "http://127.0.0.1:8001";
// const FACE_API = "http://31.97.70.146";

 
  
// ---------------- UTILS ----------------
function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}
 
function cosineDistance(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const enroll = async (req,res)=>{
    const formData = req.body;


    try {
        const { name, employeeCode, images } = formData;

        
        store.dispatch(setCurrentDatabase(formData.client || 'allbiz'));
        store.dispatch(setCurrentUser(req.authUser || 'System')); 
        const config = store.getState().constents.config;  

        const pool = await sql.connect(config);

     
        const result = await pool.request()
        .input("name", sql.NVarChar, name)
        .input("code", sql.NVarChar, employeeCode)
        .query(`
            INSERT INTO AttendanceEmployees (Name, EmployeeCode)
            OUTPUT INSERTED.EmployeeId
            VALUES (@name, @code)
        `);

        const employeeId = result.recordset[0].EmployeeId;

        // extract embeddings for each image
        for (let base64 of images) {
        const buffer = Buffer.from(base64, "base64");

        const form = new FormData();

        form.append("file", buffer, {
            filename: "face.jpg",
            contentType: "image/jpeg"
        });

        const aiRes = await axios.post(`${FACE_API}/extract`, form, {
            headers: form.getHeaders(),
        });

        if (!aiRes.data.success) continue;

        await pool.request()
            .input("empId", sql.Int, employeeId)
            .input("emb", sql.NVarChar(sql.MAX), JSON.stringify(aiRes.data.embedding))
            .query(`
            INSERT INTO FaceEmbeddings (EmployeeId, Embedding)
            VALUES (@empId, @emb)
            `);
        }

        // res.json({ success: true, employeeId });
         return res.status(200).json({
            message: "enroll successfully",
            data: {
                success: true,
                employeeId: employeeId 
            }
        });

    } catch (err) {
        // res.json({ success: false, error: err.message });
        return res.status(400).json({
            message: err.message,
            data: null
        });
    }
};

const checkIn = async (req, res) => {
    const formData = req.body;

    try {

        store.dispatch(setCurrentDatabase(formData.client || 'allbiz'));
        store.dispatch(setCurrentUser(req.authUser || 'System')); 
        const config = store.getState().constents.config;  

        const pool = await sql.connect(config);

        const imageBase64 = formData.imageBase64;

        console.log("Received check-in request");

        if (!imageBase64) {
            return res.status(400).json({
                message: "Image is required",
                data: null
            });
        }

      
        const buffer = Buffer.from(imageBase64, "base64"); 

        const form = new FormData();

        form.append("file", buffer, {
            filename: "face.jpg",
            contentType: "image/jpeg"
        });

        
        const aiRes = await axios.post(`${FACE_API}/extract`, form, {
            headers: form.getHeaders(),
            maxBodyLength: Infinity,
        });

        if (!aiRes.data.success) {
            return res.status(400).json({
                message: "Face not detected",
                data: null
            });
        }

        const inputEmb = aiRes.data.embedding;
  
        const rows = await pool.request().query(`
            SELECT TOP 200 e.EmployeeId, e.Name, f.Embedding
            FROM AttendanceEmployees e
            JOIN FaceEmbeddings f ON e.EmployeeId = f.EmployeeId
        `);

        let best = null;
        let minDist = 999;

        for (let r of rows.recordset) {
            const stored = JSON.parse(r.Embedding);
            const dist = cosineDistance(inputEmb, stored);

            if (dist < 0.38 && dist < minDist) {
                minDist = dist;
                best = r;
            }
        }

        if (!best) {
            return res.status(400).json({
                message: "No match found",
                data: null
            });
        }

        
        const lastLog = await pool.request()
            .input("empId", sql.Int, best.EmployeeId)
            .query(`
                SELECT TOP 1 *
                FROM AttendanceLogs
                WHERE EmployeeId = @empId
                ORDER BY LogTime DESC
            `);

        if (lastLog.recordset.length > 0) {
            const last = new Date(lastLog.recordset[0].LogTime);
            const now = new Date();

            const diffMinutes = (now - last) / 1000 / 60;

            if (diffMinutes < 2) {
                return res.status(400).json({
                    message: "Already marked recently",
                    data: null
                });
            }
        }

        
        await pool.request()
            .input("empId", sql.Int, best.EmployeeId)
            .query(`
                INSERT INTO AttendanceLogs (EmployeeId, Type)
                VALUES (@empId, 'IN')
            `);

        return res.status(200).json({
            message: "Check In done successfully",
            data: {
                success: true,
                employee: best.Name,
                confidence: 1 - minDist
            }
        });

    } catch (err) {
        console.error("Check-in error:", err.message);

        return res.status(400).json({
            message: err.message,
            data: null
        });
    }
};


module.exports =  {enroll,checkIn};


