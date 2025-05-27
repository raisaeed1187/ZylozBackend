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

  
const contactSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req?.authUser?.database || 'Zyloz'));
            store.dispatch(setCurrentUser(req?.authUser || 'Guest')); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try {
                  
                // const query = `exec OrganizationProfile_Save_Update '${sanitizedTableName}',${createdTableId},'${module}','${tableName}',${isMainMenu}, '${createdBy}','${currentDate}'`; 
                
                const result = await pool.request()
                    .input('Id', sql.Int, formData.id || 0)
                    .input('FirstName', sql.NVarChar(100), formData.firstName)
                    .input('LastName', sql.NVarChar(100), formData.lastName)
                    .input('Email', sql.NVarChar(255), formData.email)
                    .input('PhoneCode', sql.NVarChar(50), formData.phoneCode)
                    .input('PhoneNumber', sql.NVarChar(50), formData.phoneNumber)
                    .input('Message', sql.NVarChar(sql.MAX), formData.message)
                    .input('Agreed', sql.Bit, formData.agreed)
                    .execute('SaveOrUpdate_ContactUs');
                
                res.status(200).json({
                    message: 'Contact info saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of contactSaveUpdate

const becomePartnerSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req?.authUser?.database || 'Zyloz'));
            store.dispatch(setCurrentUser(req?.authUser || 'Guest')); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try {
                  
                // const query = `exec OrganizationProfile_Save_Update '${sanitizedTableName}',${createdTableId},'${module}','${tableName}',${isMainMenu}, '${createdBy}','${currentDate}'`; 
                
                const result = await pool.request()
                .input('Id', sql.Int, formData.id || 0)
                .input('FirstName', sql.NVarChar(100), formData.firstName)
                .input('LastName', sql.NVarChar(100), formData.lastName)
                .input('Email', sql.NVarChar(255), formData.email)
                .input('PhoneCode', sql.NVarChar(50), formData.phoneCode)
                .input('PhoneNumber', sql.NVarChar(50), formData.phoneNumber)
                .input('LaunchTimeline', sql.NVarChar(50), formData.launchTimeline)
                .input('Message', sql.NVarChar(sql.MAX), formData.message)
                .input('Agreed', sql.Bit, formData.agreed)
                .execute('SaveOrUpdate_BecomePartner');
                
                res.status(200).json({
                    message: 'Contact info saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of becomePartnerSaveUpdate


module.exports =  {contactSaveUpdate,becomePartnerSaveUpdate} ;
