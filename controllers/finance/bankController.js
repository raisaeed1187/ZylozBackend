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

  
const bankSaveUpdate = async (req,res)=>{
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
                .input('accountName', sql.NVarChar(255), formData.accountName || null)
                .input('accountCode', sql.NVarChar(50), formData.accountCode || null)
                .input('currency', sql.NVarChar(10), formData.currency || 'AED')
                .input('accountNumber', sql.NVarChar(50), formData.accountNumber || null)
                .input('bankName', sql.NVarChar(255), formData.bankName || null)
                .input('bankIdentifierCode', sql.NVarChar(50), formData.bankIdentifierCode || null)
                .input('description', sql.NVarChar(sql.MAX), formData.description || null)
                .input('isPrimary', sql.Bit, parseBoolean(formData.isPrimary) || false)
                .input('organizationId', sql.NVarChar(65), formData.organizationId || null)
                .input('createdBy', sql.NVarChar(100), formData.createdBy || null)
                .input('statusId', sql.Int, formData.statusId || null)
                .execute('BankAccount_SaveOrUpdate');
  

            res.status(200).json({
                message: 'bank saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of bankSaveUpdate

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
const getBankDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        query = `exec BankAccount_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);
 
        const data = {
            bankDetails: apiResponse.recordset[0],
            // bankItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Bank details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getBankDetails
 

const getBanksList = async (req, res) => {  
    const {organizationId,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec BankAccount_Get Null,'${organizationId}'`;   
           

        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Banks List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getBanksList
 
 


module.exports =  {bankSaveUpdate,getBanksList,getBankDetails} ;
