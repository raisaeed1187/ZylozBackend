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

  
const finAdditionalFieldSaveUpdate = async (req,res)=>{
    const formData = req.body;  

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
             
            await setTenantContext(pool,req);


            const result = await pool.request()
            .input('ID2', sql.NVarChar(65), formData.ID2 || '0')
            .input('transection', sql.NVarChar(255), formData.transection || null)
            .input('fieldName', sql.NVarChar(255), formData.fieldName || null) 
            .input('isActive', sql.Bit, parseBoolean(formData.isActive) || false) 
            .input('organizationId', sql.NVarChar(65), formData.organizationId || null) 
            .input('createdBy', sql.NVarChar(100), req.authUser.username || null)  
            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
            
            .execute('FinTransactionAddtionalField_SaveOrUpdate');   

            res.status(200).json({
                message: 'finAdditionalField saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of finAdditionalFieldSaveUpdate

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
const getFinAdditionalFieldDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
 
        query = `exec FinTransactionAddtionalField_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);
 
        const data = {
            finAdditionalFieldDetails: apiResponse.recordset[0],
            // finAdditionalFieldItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `FinAdditionalField details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getFinAdditionalFieldDetails
 

const getFinAdditionalFieldsList = async (req, res) => {  
    const {organizationId,Id,IsForPO} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
         
        query = `exec FinTransactionAddtionalField_Get Null,'${organizationId}'`;   
          
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `FinAdditionalFields List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getFinAdditionalFieldsList
 
 


module.exports =  {finAdditionalFieldSaveUpdate,getFinAdditionalFieldsList,getFinAdditionalFieldDetails} ;
