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

  
const coaSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData);

            const pool = await sql.connect(config);
            try { 
                let request = pool.request();
                request.input("ID2", sql.NVarChar(250), formData.ID2 || null);
                request.input("accountType", sql.NVarChar(50), formData.accountType);
                request.input("accountName", sql.NVarChar(50), formData.accountName);
                request.input("accountCode", sql.NVarChar(50), formData.accountCode);
                request.input("description", sql.NVarChar(500), formData.description);
                request.input("isSubMenu", sql.Bit, formData.isSubMenu == 'true' ? 1 : 0);
                request.input("parentAccount", sql.NVarChar(50), formData.isSubMenu == 'true' ? formData.parentAccount : '');
                request.input("parentAccountId", sql.NVarChar(65), formData.isSubMenu == 'true' ? formData.parentAccountId : '');
                request.input("depth", sql.Int, formData.depth); 
                request.input("isActive", sql.Bit, formData.isActive);
                request.input("CreatedBy", sql.NVarChar(100), formData.createdBy || "Admin");
 
                request.output("NewID", sql.NVarChar(250)); 

                // Execute stored procedure
                let result = await request.execute("ChartOfAccount_Save_Update");

                let newId =  result.output.NewID;
                console.log('newId');
                console.log(newId);
                let encryptedId =  formData.id;
                 
                res.status(200).json({
                    message: 'COA saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of coaSaveUpdate

 
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
 
const getCOAList = async (req, res) => {  
    const {isDetailsView} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        
        if(isDetailsView){
            query = `exec GetChartOfAccountsDetailsView`; 
        }else{
            query = `exec [GetChartOfAccounts]`; 
        }
        const apiResponse = await pool.request().query(query); 
        const formatCreatedAt = (createdAt) => {
            const date = new Date(createdAt);
            return date.toLocaleDateString("en-US");
        };
        
        // let formatedData = apiResponse.recordset.map(staff => ({
        //     ...staff,
        //     CreatedAt: formatCreatedAt(staff.CreatedAt || staff.createdAt),
        //     ChangedAt: formatCreatedAt(staff.ChangedAt || staff.changedAt), 
        // })); 
        // formatedData = formatedData.map(({ ID, ...rest }) => rest);

        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `COAs List loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCOAList
const getCOADetails = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec GetChartOfAccountsDetailsView '${Id}'`; 
        const apiResponse = await pool.request().query(query); 
       
         
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset[0];
             
        }  
        res.status(200).json({
            message: `COA details loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCOADetails
const deleteCustomerContact = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec DeleteCustomerContact '${Id}'`; 
        const apiResponse = await pool.request().query(query); 
       
        // const contactsQuery = `exec GetCustomerContactsList '${Id}'`; 
        // const contactsQueryResponse = await pool.request().query(contactsQuery); 
         
        res.status(200).json({
            message: `Customer Contact Deleted successfully!`,
            data: null
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of deleteCustomerContact
const getCOAAcountTypes = async (req, res) => {  
    
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec GetCOAAccountTypes`; 
        const apiResponse = await pool.request().query(query); 
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset;
        }  
        res.status(200).json({
            message: `COA Account types loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCOAAcountTypes


module.exports =  {getCOAAcountTypes, deleteCustomerContact,coaSaveUpdate,getCOAList,getCOADetails} ;
