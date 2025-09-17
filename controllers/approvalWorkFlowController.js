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

  
const approvalWorkFlowSaveUpdate = async (req,res)=>{
    const formData = req.body;  

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
             
            const result = await pool.request()
            .input('ID2', sql.NVarChar(65), formData.ID2 || '0')
            .input('ApprovalName', sql.NVarChar(250), formData.approvalName || null)
            .input('Transaction', sql.NVarChar(100), formData.transaction || null)
            .input('NumbersOfLevels', sql.Int, formData.numbersOfLevels || 0)
            .input('IsLimitApplicable', sql.Bit, parseBoolean(formData.isLimitApplicable) || false)
            .input('LimitPrice', sql.Decimal(18, 8), formData.limitPrice || null)
            .input('OrganizationId', sql.NVarChar(65), formData.organizationId || null)
            .input('CreatedBy', sql.NVarChar(100), formData.createdBy || null)
            .input('ApprovalFor', sql.NVarChar(100), formData.approvalFor || null)
            .input('Classification', sql.NVarChar(100), formData.classification || null)
            .input('Department', sql.NVarChar(100), formData.department || null)
            .input('Contract', sql.NVarChar(100), formData.contract || null)
            .output('ID', sql.NVarChar(100))   
            .execute('ApprovalWorkflow_SaveOrUpdate');

            const newID = result.output.ID;

            if(formData.approvalLevels){ 
                approvalLevelSaveUpdate(req,newID)
            }

            res.status(200).json({
                message: 'approvalWorkFlow saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of approvalWorkFlowSaveUpdate

async function approvalLevelSaveUpdate(req,approvalId){
    const formData = req.body; 
    const approvalLevels = JSON.parse(formData.approvalLevels); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (approvalLevels) {
                    for (let level of approvalLevels) {  
                        console.log(level);
                        if(level.approver){  

                            const result = await pool.request()
                            .input('ID2', sql.NVarChar(65), level.ID2 || '0')
                            .input('ApprovalWorkFlowId', sql.NVarChar(65), approvalId || null)
                            .input('LevelNumber', sql.Int, level.levelNumber)
                            .input('LevelName', sql.NVarChar(250), level.levelName || null)
                            .input('Approver', sql.NVarChar(65), level.approver || null)
                            .input('Delegate', sql.NVarChar(65), level.delegate || null)
                            .input('IsFinal', sql.Bit, parseBoolean(level.isFinal) || false )
                            .input('CreatedBy', sql.NVarChar(100), formData.createdBy || null)
                            .input('PriceFrom', sql.Decimal(18, 8), level.priceFrom || null)
                            .input('PriceTo', sql.Decimal(18, 8), level.priceTo || null)
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
 

const getApprovalWorkFlowsList = async (req, res) => {  
    const {organizationId,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec ApprovalWorkflow_Get Null,'${organizationId}'`;   
          
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `ApprovalWorkFlows List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getApprovalWorkFlowsList
 
 


module.exports =  {approvalWorkFlowSaveUpdate,getApprovalWorkFlowsList,getApprovalWorkFlowDetails} ;
