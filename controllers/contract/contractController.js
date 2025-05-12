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

  
const contractSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
              
            await pool.request()
            .input("ID2", sql.NVarChar(65), formData.ID2)
            .input("CustomerId", sql.NVarChar(65), formData.CustomerId)
            .input("ContactPerson", sql.VarChar(100), formData.ContactPerson)
            .input("CustomerEmail", sql.VarChar(255), formData.CustomerEmail)
            .input("CustomerPhone", sql.VarChar(50), formData.CustomerPhone)
            .input("ContractCode", sql.VarChar(50), formData.ContractCode)
            .input("ContractName", sql.VarChar(255), formData.ContractName)
            .input("ContractType", sql.VarChar(100), formData.ContractType)
            .input("StartDate", sql.VarChar(100), formData.StartDate)
            .input("EndDate", sql.VarChar(100), formData.EndDate)
            .input("AnnualAmount", sql.Decimal(18, 2), formData.AnnualAmount)
            .input("TotalAmount", sql.Decimal(18, 2), formData.TotalAmount)
            .input("ContractIncharge", sql.VarChar(100), formData.ContractIncharge) 
            .input("StatusId", sql.VarChar(25), formData.StatusId == 'null' ? null : formData.StatusId  || null) 
            .input("QuotationId", sql.VarChar(100), formData.QuotationId) 
            .input("createdBy", sql.VarChar(100), formData.createdBy)
            .execute("dbo.ClientContract_SaveUpdate");
    

            res.status(200).json({
                message: 'contract saved/updated',
                data: '' //result
            });
           
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of contractSaveUpdate

const projectSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
              
            await pool.request()
                .input("ID2", sql.NVarChar(65), formData.ID2 || null)
                .input("CustomerId", sql.NVarChar(65), formData.CustomerId)
                .input("ContactPerson", sql.VarChar(100), formData.ContactPerson || null)
                .input("CustomerEmail", sql.VarChar(255), formData.CustomerEmail || null)
                .input("CustomerPhone", sql.VarChar(50), formData.CustomerPhone || null)
                .input("ProjectCode", sql.VarChar(50), formData.ProjectCode)
                .input("ProjectName", sql.VarChar(255), formData.ProjectName)
                .input("ProjectType", sql.VarChar(100), formData.ProjectType)
                .input("StartDate", sql.VarChar(100), formData.StartDate || null)
                .input("EndDate", sql.VarChar(100), formData.EndDate || null)
                .input("AnnualAmount", sql.Decimal(18, 2), formData.AnnualAmount)
                .input("TotalAmount", sql.Decimal(18, 2), formData.TotalAmount)
                .input("ProjectIncharge", sql.VarChar(100), formData.ProjectIncharge || null)
                .input("Description", sql.VarChar(sql.MAX), formData.Description || null)
                .input("StatusId", sql.VarChar(25), formData.StatusId == 'null' ? null : formData.StatusId  || null)
                .input("QuotationId", sql.VarChar(100), formData.QuotationId) 
                .input("CreatedBy", sql.VarChar(100), formData.createdBy || null)
                .execute("dbo.ClientProject_SaveUpdate");
    

            res.status(200).json({
                message: 'project saved/updated',
                data: '' //result
            });
           
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of projectSaveUpdate

 
 
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
 
const getContractDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';

        if (Id){
            query = `exec ClientContract_Get '${Id}'`;  

        } else{
            query = `exec ClientContract_Get `;  

        }
         
         
        const apiResponse = await pool.request().query(query); 
         
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Contract details loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getContractDetails

const getProjectDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';

        if (Id){
            query = `exec ClientProject_Get '${Id}'`;  

        } else{
            query = `exec ClientProject_Get `;  

        }
         
         
        const apiResponse = await pool.request().query(query); 
         
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Project details loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getProjectDetails

const getContractsList = async (req, res) => {  
    const {date,isMonthly} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec ClientContract_GetList `;   
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Contracts List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getContractsList

 


module.exports =  {projectSaveUpdate,contractSaveUpdate,getContractsList,getProjectDetails,getContractDetails} ;
