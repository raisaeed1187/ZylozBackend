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
const { setTenantContext } = require("../../helper/db/sqlTenant");


const SECRET_KEY = process.env.SECRET_KEY;

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "documents";
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

  
const financeConfigurationSave = async (req, res) => {  
    const formData = req.body; 
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 

        console.log('formData finance');
        console.log(formData);

        await setTenantContext(pool,req);


        const result = await pool.request()
            .input('ID2', sql.NVarChar(250), formData.ID2)  
            .input("documentPostingDate", sql.NVarChar(255), formData.documentPostingDate) 
            .input('CreatedBy', sql.NVarChar(250), req.authUser.username )  
            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
            
            .execute('FinanceConfiguration_SaveOrUpdate');    
  
        

        res.status(200).json({
            message: `Finance configuration saved successfully!`,
            data: ''
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of financeConfigurationSave

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
const getFinanceConfiguration = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        await setTenantContext(pool,req);
          
        const query = `exec Get_FinanceConfiguration `;  
        const apiResponse = await pool.request().query(query);  
 

        let letResponseData = {};
        if(apiResponse.recordset){ 
            letResponseData =  {
                configuration: apiResponse.recordset[0], 
            };
        }   
        res.status(200).json({
            message: `Finance configuration loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
 

const financialPeriodLockSave = async (req, res) => {
    const formData = req.body;

    try {
        // set current database and user in Redux store
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser));

        // get MSSQL connection config
        const config = store.getState().constents.config;
        const pool = await sql.connect(config);

        await setTenantContext(pool,req);

        console.log("Financial Period Lock formData:", formData);
 
        const result = await pool.request()
            .input("ID2", sql.NVarChar(65), formData.ID2 || null)
            .input("ModuleName", sql.NVarChar(100), formData.name)
            .input("LockType", sql.NVarChar(50), parseBoolean(formData.partial) ? 'Partial':'Full')
            .input("LockDate", sql.NVarChar(100), formData.lockDate)
            .input("IsLocked", sql.Bit, parseBoolean(formData.isLocked) || false)
            .input("Reason", sql.NVarChar(500), formData.reason || null)
            .input("ActionBy", sql.NVarChar(100), req.authUser.username)
            .input("OrganizationId", sql.NVarChar(100), formData.organizationId)
            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  

            .execute("FinancialPeriodLock_SaveOrUpdate");

        // send response
        res.status(200).json({
            message: "Financial Period Lock saved successfully!",
            data: result.recordset || [],
        });

    } catch (error) {
        console.error("Error saving Financial Period Lock:", error);
        return res.status(400).json({
            message: error.message,
            data: null,
        });
    }
};

const getfinancialPeriodLocks = async (req, res) => {  
    const {Id,organizationId} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        await setTenantContext(pool,req);
          
        const response = await pool
            .request()
            .input("ID2", sql.NVarChar, null)
            .input("organizationId", sql.NVarChar, organizationId || null) 
            .execute("FinancialPeriodLock_Get");
                            
                            
        res.status(200).json({
            message: `Finance Period Locking loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};

module.exports =  {getfinancialPeriodLocks,financialPeriodLockSave,financeConfigurationSave,getFinanceConfiguration} ;
