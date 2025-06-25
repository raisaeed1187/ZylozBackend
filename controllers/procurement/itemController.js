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

  
const itemSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
              
            const result = await pool.request()
            .input('ID2', sql.NVarChar(65), formData.ID2)
            .input('itemType', sql.NVarChar(65), formData.itemType)
            .input('itemCode', sql.NVarChar(100), formData.itemCode)
            .input('itemName', sql.NVarChar(255), formData.itemName)
            .input('itemDescription', sql.NVarChar(sql.MAX), formData.itemDescription)
            .input('itemCategory', sql.NVarChar(65), formData.itemCategory)
            .input('itemSubCategory', sql.NVarChar(65), formData.itemSubCategory)
            .input('unitOfMeasurement', sql.NVarChar(65), formData.unitOfMeasurement)
            .input('partNumber', sql.NVarChar(100), formData.partNumber)
            .input('barcode', sql.NVarChar(255), formData.barcode) 
            .input("statusId", sql.Int, formData.statusId === 'null' ? null : formData.statusId || null) 
            .input('sellingPrice', sql.NVarChar(100), formData.sellingPrice || '0')
            .input('costPrice', sql.NVarChar(100), formData.costPrice || '0')
            .input('createdBy', sql.NVarChar(100), formData.createdBy)
            .execute('dbo.MaterialItem_SaveUpdate');

    

            res.status(200).json({
                message: 'item saved/updated',
                data: '' //result
            });
           
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of itemSaveUpdate
 

 
 
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
 
const getItemDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';

        if (Id){
            query = `exec MaterialItem_Get '${Id}'`;  

        } else{
            query = `exec MaterialItem_Get `;  

        }
         
         
        const apiResponse = await pool.request().query(query); 
         
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Item details loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getItemDetails
 

const getItemsList = async (req, res) => {  
    const {date,isMonthly} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec MaterialItem_GetList `;   
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Items List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getItemsList

 


module.exports =  {itemSaveUpdate,getItemsList,getItemDetails} ;
