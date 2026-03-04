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

  

const visaSaveUpdate = async (req,res)=>{
    const formData = req.body;

    let pool, transaction;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            pool = await sql.connect(config);
            transaction = new sql.Transaction(pool);

            await setTenantContext(pool,req);

           
            await transaction.begin();
            
              

            try { 
                   
                console.log('formData');
                console.log(formData);

                
                    const request = new sql.Request(transaction);

                    const result = await request
                        .input('ID2', sql.NVarChar(65), formData.ID2 || null)
                        .input('Name', sql.NVarChar(200), formData.name)
                        .input('LicenseId', sql.NVarChar(65), formData.licenseId)
                        .input('PassportNumber', sql.NVarChar(100), formData.passportNumber)
                        .input('VisaExpryDate', sql.Date, formData.visaExpryDate || null)
                        .input('LaborCardNumber', sql.NVarChar(100), formData.laborCardNumber)
                        .input('LaborCardExpiryDate', sql.Date, formData.laborCardExpiryDate || null)
                        .input('MobileNumber', sql.NVarChar(50), formData.mobileNumber)
                        .input('VisaNumber', sql.NVarChar(50), formData.visaNumber)
                        .input('Email', sql.NVarChar(200), formData.email)
                        .input('VisaStatus', sql.Int, formData.visaStatus || 1)
                        .input('IsActive', sql.Bit, parseBoolean(formData.isActive))
                        .input('OrganizationId', sql.NVarChar(65), formData.organizationId)
                        .input('TenantId', sql.NVarChar(65), req.authUser.tenantId)
                        .input('IsDeleted', sql.Bit, parseBoolean(formData.isDeleted) || 0)
                        .input('UserName', sql.NVarChar(150), req.authUser.username || 'Admin')
                        // .input('PassportExpiryDate', sql.Date, formData.passportExpiryDate || null)
                        .input('IsCancelled', sql.Bit, parseBoolean(formData.isCancelled) || 0)
                        .execute('Visa_SaveOrUpdate');
    
                 
                    const newId = result.recordset[0].Id;
                    const message = result.recordset[0].Message;
    
                      
                    if(formData.documents){
                        await visaDocumentSaveUpdate(req,newId, transaction);
                    }

                
  

                

                await transaction.commit();


                res.status(200).json({
                    message: 'Visa saved/updated',
                    data: '' //result
                });
            }  catch (err) { 
                console.error("SQL ERROR DETAILS:", err);
                if (transaction) try { await transaction.rollback(); } catch(e) {}
                
                return res.status(400).json({ 
                    message: err.message,
                    // sql: err.originalError?.info || err
                }); 
            }
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
} 

// end of visaSaveUpdate

  
async function visaDocumentSaveUpdate(req, VisaId, transaction) {
    try {
        const formData = req.body;
        const documentsArray = formData.documents ? JSON.parse(formData.documents) : [];
        const files = req.files || [];

        for (const doc of documentsArray) {
             
            const matchingFile = files.find(f => f.fieldname === doc.fileKey);

            
            let fileUrl = null;
            let fileName = doc.fileName || null;
            let fileType = doc.documentType || null;

            

            if (matchingFile) { 
                const uploaded = await uploadDocument(matchingFile);
                fileUrl = uploaded.fileUrl;
                fileName = matchingFile.originalname;  
                fileType = matchingFile.mimetype;     
            }
 
          
            const request = new sql.Request(transaction);
            await request
                .input("ID2", sql.NVarChar(65), "0")
                .input("VisaId", sql.NVarChar(65), VisaId)
                .input("FileName", sql.NVarChar(255), fileName)
                .input("FileUrl", sql.NVarChar(sql.MAX), fileUrl)
                .input("FileType", sql.NVarChar(100), fileType)
                .input("DocumentType", sql.NVarChar(100), doc.documentType)
                .input("Size", sql.Int, doc.size || null)
 
                .execute("VisaDocuments_SaveOrUpdate");

        }

        return true;

    } catch (error) {
        console.error('Error saving visa documents:', error);
        throw error;
    }
}


async function uploadDocument(file){ 
    try {
         

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
                fileName: blobName.split('.').slice(0, -1).join('.'),
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

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
const getVisaDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
 
       
        const apiResponse = await pool.request() 
                            .input('ID2', sql.NVarChar(65),  Id) 
                            .input('TenantId', sql.NVarChar(65), req.authUser.tenantId) 
                            .execute('Visa_Get');
 

        const documentApiResponse = await pool.request() 
                    .input('VisaId', sql.NVarChar(65),  Id)  
                    .execute('VisaDocuments_Get');

        const details = {
            ...apiResponse.recordset[0],
            documents:documentApiResponse.recordset
        }          
        const data = {
            visaDetails: details, 
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Visa details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getVisaDetails
 

const getVisasList = async (req, res) => {  
    const {organizationId,Id,IsForPO} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
           
          
        const apiResponse = await pool.request() 
                            .input('ID2', sql.NVarChar(65),  null)
                            .input('OrganizationId', sql.NVarChar(65), organizationId || null) 
                            .input('TenantId', sql.NVarChar(65), req.authUser.tenantId) 
                            .execute('Visa_Get');
 
        
        res.status(200).json({
            message: `Visas List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getVisasList
 

const getVisaSummary = async (req, res) => {  
    const {organizationId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);   
            await setTenantContext(pool,req);
  
        const apiResponse = await pool.request() 
                            .input('OrganizationId', sql.NVarChar(65),  organizationId) 
                            .input('TenantId', sql.NVarChar(65), req.authUser.tenantId) 
                            .execute('Visa_GetSummary');
  
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Visa summary loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getVisaSummary
 
 
const deleteVisaDocument = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
 
         
         const apiResponse = await pool.request() 
            .input('ID2', sql.NVarChar(65),  Id)  
            .execute('VisaDocuments_Delete');

           
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Visa document deleted successfully!`,
            data: ''
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of deleteVisaDocument



module.exports =  {deleteVisaDocument, visaSaveUpdate,getVisasList,getVisaDetails,getVisaSummary} ;
