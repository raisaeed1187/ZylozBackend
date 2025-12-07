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

  
const tenantModuleSubscription = async (req, res) => {
    const { apps, isTrail, price } = req.body;

    let pool, transaction;

    try {
        // set redux contexts like your example
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser));

        const config = store.getState().constents.config;
 
        const moduleIds = JSON.parse(apps);   

        pool = await sql.connect(config);
        await setTenantContext(pool, req);

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        for (const moduleId of moduleIds) {
            const request = new sql.Request(transaction); 
            await request
                .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
                .input("ModuleID", sql.NVarChar(65), moduleId)
                .input("IsTrial", sql.Bit,  parseBoolean(isTrail) ? 1 : 0)
                .input("Price", sql.Decimal(18, 2), price ?? null)
                .input("SubscriptionStatus", sql.NVarChar(50), "Active")
                .input("User", sql.NVarChar(65), req.authUser.username)
                .execute("TenantModules_SaveOrUpdate");
        }

        await transaction.commit();

        return res.status(200).json({
            message: "Tenant module subscription saved successfully",
            modulesProcessed: moduleIds.length,
        });

    } catch (err) {
        console.error("SUBSCRIPTION ERROR:", err);

        if (transaction) {
            try { await transaction.rollback(); } catch (e) {}
        }

        return res.status(400).json({
            message: err.message,
        });
    }
};

// end of tenantModuleSubscription

async function approvalLevelSaveUpdate(req,approvalId,transaction){
    const formData = req.body; 
    const approvalLevels = JSON.parse(formData.approvalLevels); 
    try {
             
            try { 
                if (approvalLevels) {
                    for (let level of approvalLevels) {  
                        console.log(level);
                        if(level.approver){  
                            const levelRequest = new sql.Request(transaction);
                            
                            const result = await levelRequest
                            .input('ID2', sql.NVarChar(65), level.ID2 || '0')
                            .input('ApprovalWorkFlowId', sql.NVarChar(65), approvalId || null)
                            .input('LevelNumber', sql.Int, level.levelNumber)
                            .input('LevelName', sql.NVarChar(250), level.levelName || null)
                            .input('Approver', sql.NVarChar(65), level.approver || null)
                            .input('Delegate', sql.NVarChar(65), level.delegate || null)
                            .input('IsFinal', sql.Bit, parseBoolean(level.isFinal) || false )
                            .input('CreatedBy', sql.NVarChar(100), req.authUser.username || null)
                            .input('PriceFrom', sql.Decimal(18, 8), level.priceFrom || null)
                            .input('PriceTo', sql.Decimal(18, 8), level.priceTo || null)
                            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
                             
                            .execute('ApprovalWorkflowLevels_SaveOrUpdate');
                        }
                    } 
                }


            } catch (err) {
                throw new Error(err.message);
            }  
        } catch (error) { 
            throw new Error(error.message);
        }
}
// end of invoiceItemSaveUpdate

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
const getApprovalWorkFlowDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        await setTenantContext(pool,req);
 
        query = `exec ApprovalWorkflow_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);

        let levelsQuery = `exec ApprovalWorkflowLevels_Get NULL,'${Id}'`;   
        const levelsQueryApiResponse = await pool.request().query(levelsQuery);
 
        
        const data = {
            approvalWorkFlowDetails: apiResponse.recordset[0],
            approvalWorkFlowLevels: levelsQueryApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `ApprovalWorkFlow details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getApprovalWorkFlowDetails
 

const getAppsList = async (req, res) => {  
    const {} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        await setTenantContext(pool,req);
         
        query = `exec GetMainModule`;   
          
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Apps List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAppsList
 

 


module.exports =  {tenantModuleSubscription,getAppsList,getApprovalWorkFlowDetails} ;
