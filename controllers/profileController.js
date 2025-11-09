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

  
const orgProfileSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try {
                let logoUrl = null;
                if(Array.isArray(req.files?.logo)){
                    logoUrl = req.files["logo"] ? (await uploadDocument(req.files["logo"][0])).fileUrl : null;
                }
                let attachments = null;
                if(Array.isArray(req.files?.attachments)){
                    attachments = req.files["attachments"]
                        ? await Promise.all(req.files["attachments"].map(file => uploadDocument(file).then((res)=>{return res})))
                        : []; 
                }

                 


                // const query = `exec OrganizationProfile_Save_Update '${sanitizedTableName}',${createdTableId},'${module}','${tableName}',${isMainMenu}, '${createdBy}','${currentDate}'`; 
                
                let result = await pool.request()
                    .input('ID2', sql.NVarChar(250), formData.id)   
                    .input('OrganizationName', sql.NVarChar(250), formData.organizationName)
                    .input('Industry', sql.NVarChar(250), formData.industry)
                    .input('Location', sql.NVarChar(250), formData.location)
                    .input('ContactNo', sql.NVarChar(250), formData.phone)  
                    .input('Email', sql.NVarChar(250), formData.email)
                    .input('AddressLine1', sql.NVarChar(250), formData.addressLine1)
                    .input('AddressLine2', sql.NVarChar(250), formData.addressLine2)
                    .input('City', sql.NVarChar(250), formData.city)
                    .input('State', sql.NVarChar(250), formData.state)
                    .input('LicensesNumber', sql.NVarChar(250), formData.licensesNumber)
                    .input('TRNNumber', sql.NVarChar(250), formData.trnNumber)
                    .input('ExpiryDate', sql.NVarChar(250), formData.expiryDate) 
                    .input('EstCardDetails', sql.NVarChar(250), formData.estCardDetails)
                    .input('EstCardExpiryDate', sql.NVarChar(250), formData.estCardExpiryDate) 
                    .input('Status', sql.NVarChar(50), "1") 
                    .input('Logo', sql.NVarChar(250), typeof formData.logo === "string" && formData.logo.startsWith("http") ? formData.logo : logoUrl) 
                    .input('Attachments', sql.NVarChar(250), "") 
                    .input('CreatedBy', sql.NVarChar(250), formData.createdBy || "Admin") 
                    .input('CreatedAt', sql.DateTime, formData.createdAt || new Date())  
                   
                    .input('bankCode', sql.NVarChar(255), formData.bankCode || "")
                    .input('bankName', sql.NVarChar(255), formData.bankName || "")
                    .input('bankAccount', sql.NVarChar(255), formData.bankAccount || "")
                    .input('bankIbanNo', sql.NVarChar(255), formData.bankIbanNo || "")
                    .input('bankSwiftCode', sql.NVarChar(255), formData.bankSwiftCode || "")
                    .input('employeePrefixCode', sql.NVarChar(255), formData.employeePrefixCode || "")
                    .input('currency', sql.NVarChar(65), formData.currency || "")
                    

                    .output('NewID', sql.NVarChar(250))
                    .execute('OrganizationProfile_Save_Update'); 
                // const result = await pool.request().query(query); 
                // let newId = result.recordset[0].NewID;
                let newId =  result.output.NewID;
                console.log('newId');
                console.log(newId);
                let encryptedId =  formData.id;
                if(formData.id == '0'){
                     encryptedId =  encryptID(newId);
                    console.log(encryptedId);
    
                    await pool.request()
                    .query(`
                        UPDATE OrganizationProfile 
                        SET ID2 = '${encryptedId}' 
                        WHERE ID = ${newId}
                    `);

                    const coaRequest = pool.request();
                        request.input("Mode", sql.NVarChar(100), String(formData.mode));
                        request.input("SourceOrganizationId", sql.NVarChar(100), String(formData.sourceOrganizationId) || null);
                        request.input("TargetOrganizationId", sql.NVarChar(100), encryptedId || null); 
                        request.input("CreatedBy", sql.NVarChar(100), req.authUser.username); 
                        await request.execute("TransferChartOfAccounts");

                }
                if(attachments){
                    await saveOrgProfileDocuments(pool,attachments,encryptedId,formData);
                }
                res.status(200).json({
                    message: 'Organization profile saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of orgProfileSaveUpdate
function encryptID(id) {
  
    const secretKey = process.env.ENCRYPT_SECRET_KEY;   
    const iv = crypto.randomBytes(16);  
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secretKey, 'utf-8'), iv);

    let encrypted = cipher.update(id.toString(), 'utf-8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + encrypted; // Return IV + Encrypted Data
}
// end of encryptID
async function uploadDocument(file){ 
    try {
        console.log('file');
        console.log(file);

        if(file){
            const blobName = file.originalname;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            const uploadFilePath = file.path;
    
            // Upload file to Azure Blob Storage
            const uploadStream = fs.createReadStream(uploadFilePath);
            await blockBlobClient.uploadStream(uploadStream);
            fs.unlinkSync(uploadFilePath); // Delete local file
    
            const fileUrl = blockBlobClient.url;
            console.log('fileUrl');
            console.log(fileUrl);
            const fileInfo = {
                fileName: blobName,
                fileUrl:fileUrl
            }
            return fileInfo

        }else{
            const fileInfo = {
                fileName: '',
                fileUrl:''
            }
            return fileInfo;
        }
    } catch (error) {
        console.error(error);
        throw new Error(error.message);
    }
}
// end of uploadDocument

async function saveOrgProfileDocuments(pool,attachmentUrls,NewID,formData){ 

    try { 
        if (attachmentUrls.length > 0) {
            for (let url of attachmentUrls) { 
                  
                await pool.request()
                    .input("ID2", sql.NVarChar, "0") // Assuming 0 for new entry
                    .input("ProfileId", sql.NVarChar, NewID) // Use the ID from the profile
                    .input("DocumentName", sql.NVarChar, url.fileName) // Extract file name
                    .input("DocumentUrl", sql.NVarChar, url.fileUrl) // Store URL
                    .input("CreatedBy", sql.NVarChar,formData.createdBy )
                    .input("CreatedAt", sql.DateTime, formData.createdAt)
                    .execute("OrganizationProfileDocument_SaveOrUpdate");
            }
        } 

    } catch (error) {
        console.error(error);
        throw new Error(error.message);
    }
}
// end of saveOrgProfileDocuments

const getOrgProfileList = async (req, res) => {  
    // const {tableId, tableName} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec OrganizationProfile_Get`; 
        const apiResponse = await pool.request().query(query); 
         
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `OrganizationProfile loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getOrgProfileList
const getOrgProfileDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec GetOrganizationProfile '${Id}'`; 
        const apiResponse = await pool.request().query(query); 
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset[0];
        }  
        res.status(200).json({
            message: `OrganizationProfile details loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getOrgProfileDetails
const getOrgProfileDocuments = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec GetOrganizationProfileDocuments '${Id}'`; 
        const apiResponse = await pool.request().query(query); 
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset;
        }  
        res.status(200).json({
            message: `OrganizationProfile documents loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getOrgProfileDocuments

const branchSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try {
                  
                const result = await pool.request()
                .input('ID2', sql.NVarChar(65), formData.ID2)
                .input('BranchName', sql.NVarChar(150), formData.branchName)
                .input('OrganizationId', sql.NVarChar(65), formData.organizationId)
                .input('Phone', sql.NVarChar(50), formData.phone)
                .input('Address', sql.NVarChar(255), formData.address)
                .input('TRN', sql.NVarChar(50), formData.trn)
                .input('CreatedBy', sql.NVarChar(100), formData.createdBy)
                .execute('Branch_SaveOrUpdate');
                 
                res.status(200).json({
                    message: 'Branch saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of branchSaveUpdate

const getBranchDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec Branch_Get '${Id}'`;  
        const apiResponse = await pool.request().query(query); 
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset[0];
        }  
        res.status(200).json({
            message: `Branch loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getBranchDetails
const getBranchesList = async (req, res) => {  
    const {organizationId,Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec Branch_Get Null,'${organizationId}'`;  
        const apiResponse = await pool.request().query(query); 
          
        res.status(200).json({
            message: `Branch loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getBranchesList

module.exports =  {getBranchesList,getBranchDetails,branchSaveUpdate,orgProfileSaveUpdate,getOrgProfileList,getOrgProfileDetails,getOrgProfileDocuments} ;
