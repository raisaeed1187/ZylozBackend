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

  
const shiftSaveUpdate = async (req,res)=>{
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
            .input('shiftName', sql.NVarChar(255), formData.shiftName || null) 
            .input('startTime', sql.NVarChar(100), formData.startTime || null) 
            .input('endTime', sql.NVarChar(100), formData.endTime || null)  
            .input('organizationId', sql.NVarChar(65), formData.organizationId || null) 
            .input('createdBy', sql.NVarChar(100), req.authUser.username)  
            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
            
            .execute('ShiftMaster_SaveOrUpdate');   

            res.status(200).json({
                message: 'shift saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of shiftSaveUpdate

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
const getShiftDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
 
        query = `exec ShiftMaster_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);
 
        const data = {
            shiftDetails: apiResponse.recordset[0],
            // shiftItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Shift details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getShiftDetails
 

const getShiftsList = async (req, res) => {  
    const {organizationId,Id,IsForPO} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
         
        query = `exec ShiftMaster_Get Null,'${organizationId}'`;   
          
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Shifts List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getShiftsList
 
 


module.exports =  {shiftSaveUpdate,getShiftsList,getShiftDetails} ;
