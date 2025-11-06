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
        let query = '';
         
        query = `exec GetProfitAndLoss_Dashboard
        '${fromYear}', 
         ${fromMonth ? `'${fromMonth}'` : 'NULL'},
        '${toYear}', 
         ${toMonth ? `'${toMonth}'` : 'NULL'}, 
        '${organizationId}', 
        ${groupByYear}`;   
          
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Profit & Loss loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getProfitAndLoss

const getAgingDashboard = async (req, res) => {  
    const {organizationId,fromDate,toDate,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec GetCustomerVendorAgingDashboard 
         ${fromDate ? `'${fromDate}'` : 'NULL'}, 
         ${toDate ? `'${toDate}'` : 'NULL'}, 
        '${organizationId}'
        `;   
          
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Aging loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAgingDashboard

 


module.exports =  {getProfitAndLossDashboard,getAgingDashboard} ;
