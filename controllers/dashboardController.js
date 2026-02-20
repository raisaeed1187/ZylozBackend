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


const SECRET_KEY = process.env.SECRET_KEY;

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "documents";
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

   
function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
 

const getProfitAndLossDashboard = async (req, res) => {  
    const {organizationId,fromYear,fromMonth,toYear,toMonth,groupByYear,groupByOrganization,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        await setTenantContext(pool,req);
 

        const result = await pool.request()
            .input('FromYear', sql.Int, fromYear)
            .input('FromMonth', sql.Int, fromMonth || null)
            .input('ToYear', sql.Int, toYear)
            .input('ToMonth', sql.Int, toMonth || null)
            .input('OrganizationId', sql.NVarChar(65), organizationId || null)
            .input('GroupByYear', sql.Bit, groupByYear)
            .execute('GetProfitAndLoss_Dashboard');
          
       
        
        res.status(200).json({
            message: `Profit & Loss loaded successfully!`,
            data:  result.recordset
        });
         
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getProfitAndLoss

const getAgingDashboard = async (req, res) => {  
    const {organizationId,fromDate,toDate,Id} = req.body; 
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        await setTenantContext(pool,req);

        
        const apiResponse = await pool.request()
        .input('StartDate', sql.Date, fromDate || null)
        .input('EndDate', sql.Date, toDate || null)
        .input('OrganizationId', sql.NVarChar(65), organizationId || null)
        .execute('GetCustomerVendorAgingDashboard');
        
        res.status(200).json({
            message: `Aging loaded successfully!`,
            data:  apiResponse.recordset
        });
        
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAgingDashboard


const getEmployeesByJoiningDate = async (req, res) => {  
    const {organizationId,fromYear,fromMonth,toYear,toMonth,Id} = req.body; 
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        await setTenantContext(pool,req);

        
        const apiResponse = await pool.request() 
        .input('FromYear', sql.NVarChar(65), fromYear || null)
        .input('FromMonth', sql.NVarChar(65), fromMonth || null)
        .input('ToYear', sql.NVarChar(65), toYear || null)
        .input('ToMonth', sql.NVarChar(65), toMonth || null)
        .input('OrganizationId', sql.NVarChar(65), organizationId || null)

        .execute('GetEmployeeJoiningMonthWise');
        
        res.status(200).json({
            message: `Employees by joining date loaded successfully!`,
            data:  apiResponse.recordset
        });
        
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getEmployeesByJoiningDate

const getPayrollByMonth = async (req, res) => {  
    const {organizationId,fromYear,fromMonth,toYear,toMonth,Id} = req.body; 
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        await setTenantContext(pool,req);

        
        const apiResponse = await pool.request() 
        .input('FromYear', sql.NVarChar(65), fromYear || null)
        .input('FromMonth', sql.NVarChar(65), fromMonth || null)
        .input('ToYear', sql.NVarChar(65), toYear || null)
        .input('ToMonth', sql.NVarChar(65), toMonth || null)
        .input('OrganizationId', sql.NVarChar(65), organizationId || null)

        .execute('GetPayrollMonthWiseCost');
        
        res.status(200).json({
            message: `Payroll  loaded successfully!`,
            data:  apiResponse.recordset
        });
        
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPayrollByMonth

 


module.exports =  {getProfitAndLossDashboard,getAgingDashboard,getEmployeesByJoiningDate,getPayrollByMonth} ;
