const sql = require("mssql");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config(); 
const store = require('../../store'); 
const { setCurrentDatabase,setCurrentUser } = require('../../constents').actions;
const fs = require("fs");
const crypto = require('crypto');
const multer = require("multer");
const { BlobServiceClient } = require("@azure/storage-blob"); 
const constentsSlice = require("../../constents");


const SECRET_KEY = process.env.SECRET_KEY;

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "documents";
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

  
const attendanceSaveUpdate = async (req,res)=>{
    // const formData = req.body;
    const { attendance, changedBy } = req.body;
    

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            const attendanceData = JSON.parse(attendance); 
            // console.log('formData');
            console.log(attendanceData);
             
            const formatTime = (time) => {
                if (!time) return '';   
                return time.length === 5 ? `${time}:00` : time;  
            };

            const pool = await sql.connect(config);
            try { 
                for (const record of attendanceData) {
                    // console.log(record);
                    await pool.request()
                      .input("id", sql.Int, record.id)
                      .input("staffId", sql.NVarChar(65), record.staffId)
                      .input("staffName", sql.NVarChar(100), record.staffName)
                      .input("designation", sql.NVarChar(50), record.designation)
                      .input("projectName", sql.NVarChar(100), record.projectName)
                      .input("punchIn", sql.NVarChar(50), formatTime(record.punchIn))
                      .input("punchOut", sql.NVarChar(50), formatTime(record.punchOut))
                      .input("normalOT", sql.Decimal(5, 2), record.normalOT)
                      .input("holidayOT", sql.Decimal(5, 2), record.holidayOT)
                      .input("weeklyOT", sql.Decimal(5, 2), record.weeklyOT)
                      .input("attendanceStatus", sql.NVarChar(20), record.attendanceStatus)
                      .input("attendanceDate", sql.Date, record.attendanceDate)
                      .input("dayStatus", sql.NVarChar(100), record.dayStatus)
                      .input("isLeaveDelete", sql.Bit, record.isLeaveDelete) 
                      .input("breakTime", sql.NVarChar(100), record.breakTime)
                      .input("totalWorkingHours", sql.NVarChar(100), record.totalWorkingHours)
                      .input("absentType", sql.NVarChar(100), record.absentType) 
                      .input("changedBy", sql.NVarChar(100), changedBy)
                      .input("projectId", sql.NVarChar(65), record.projectID)
                      .input("locationId", sql.NVarChar(65), record.locationId)

                      .execute("dbo.StaffAttendance_SaveOrUpdate");
                }
  
                res.status(200).json({
                    message: 'Attendance saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                console.error("Error executing query:", err);
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of attendanceSaveUpdate

const employeeAttendanceMasterSaveUpdate = async (req,res)=>{
    // const formData = req.body;
    const { attendance, changedBy } = req.body;
    

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            // console.log('formData');
            // console.log(attendance);
            const attendanceData = JSON.parse(attendance); 
             
            const formatTime = (time) => {
                return time.length === 5 ? `${time}:00` : time; // Convert "08:00" to "08:00:00"
            };
            const pool = await sql.connect(config);
            try { 
                for (const record of attendanceData) {
                    // console.log(record);
                    await pool.request()
                    //   .input("id", sql.Int, record.id)
                      .input("staffId", sql.NVarChar(65), record.staffId)  
                      .input("projectId", sql.NVarChar(100), record.projectId)
                      .input("punchIn", sql.NVarChar(50), formatTime(record.punchIn))
                      .input("punchOut", sql.NVarChar(50), formatTime(record.punchOut)) 
                      .input("attendanceStatus", sql.NVarChar(20), record.attendanceStatus) 
                      .input("weeklyOffDay", sql.NVarChar(100), record.weeklyOffDay) 
                      .input("breakTime", sql.NVarChar(100), record.breakTime) 
                      .input("changedBy", sql.NVarChar(100), changedBy)
                      .input("locationId", sql.NVarChar(65), record.locationId) 
                      .execute("dbo.StaffAttendanceMaster_SaveOrUpdate");
                }
  
                res.status(200).json({
                    message: 'Attendance master saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of employeeAttendanceMasterSaveUpdate

 
// end of customerContactSaveUpdate
function encryptID(id) {
  
    const secretKey = process.env.ENCRYPT_SECRET_KEY;   
    const iv = crypto.randomBytes(16);  
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secretKey, 'utf-8'), iv);

    let encrypted = cipher.update(id.toString(), 'utf-8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + encrypted; // Return IV + Encrypted Data
}
// end of encryptID
 
const getAttendanceList = async (req, res) => {  
    const {date,isMonthly} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';

        if(isMonthly){ 
            query = `exec StaffAttendance_Get '${date}', ${isMonthly ? 1 : 0}`;  
         
        }else{
            query = `exec StaffAttendance_Get '${date}',${isMonthly ? 1 : 0}`;  
        } 
         
        const apiResponse = await pool.request().query(query); 
        
        const formatCreatedAt = (newDate) => {
            const date = newDate.toISOString().split("T")[0];
            // return date.toLocaleDateString("en-US");
            return date;

        };

        let formatedData = apiResponse.recordset.map(data => ({
            ...data,
            attendanceDate: formatCreatedAt(data.attendanceDate), 
        })); 
        // formatedData = formatedData.map(({ ID, ...rest }) => rest);

        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Attendances List loaded successfully!`,
            data:formatedData // apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAttendanceList

const getAttendanceMasterList = async (req, res) => {  
    const {date,isMonthly} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';

         
        query = `exec StaffAttendanceMaster_Get `;  
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Attendances List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAttendanceMasterList

const getAttendanceDetails = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec GetChartOfAccountsDetailsView '${Id}'`; 
        const apiResponse = await pool.request().query(query); 
       
         
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset[0];
             
        }  
        res.status(200).json({
            message: `Attendance details loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAttendanceDetails
const deleteCustomerContact = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec DeleteCustomerContact '${Id}'`; 
        const apiResponse = await pool.request().query(query); 
       
        // const contactsQuery = `exec GetCustomerContactsList '${Id}'`; 
        // const contactsQueryResponse = await pool.request().query(contactsQuery); 
         
        res.status(200).json({
            message: `Customer Contact Deleted successfully!`,
            data: null
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of deleteCustomerContact
const getAttendanceAcountTypes = async (req, res) => {  
    
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec GetAttendanceAccountTypes`; 
        const apiResponse = await pool.request().query(query); 
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset;
        }  
        res.status(200).json({
            message: `Attendance Account types loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAttendanceAcountTypes



module.exports =  {getAttendanceAcountTypes, deleteCustomerContact,employeeAttendanceMasterSaveUpdate,attendanceSaveUpdate,getAttendanceMasterList,getAttendanceList,getAttendanceDetails} ;
