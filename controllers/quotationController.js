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

  
const quotationSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                  
                 
                const result = await pool.request()
                    .input('ID2', sql.NVarChar(250), formData.id)  
                    .input('customerId', sql.NVarChar(350), formData.customerId)
                    .input('quotationNo', sql.NVarChar(250), formData.quotationNo)
                    .input('referenceNo', sql.NVarChar(250), formData.referenceNo)
                    .input('quotationDate', sql.DateTime, formData.quotationDate)
                    .input('quotationExpiryDate', sql.DateTime, formData.quotationExpiryDate)
                    .input('salesPersonId', sql.NVarChar(250), formData.salesPersonId)
                    .input('projectId', sql.NVarChar(250), formData.projectId)
                    .input('notes', sql.NVarChar(500), formData.notes)
                    .input('projectDescription', sql.NVarChar(500), formData.projectDescription)
                    .input('subject', sql.NVarChar(250), formData.subject)
                    .input('termsConditions', sql.NVarChar(sql.MAX), formData.termsConditions) 
                    .input('createdBy', sql.NVarChar(100), formData.createdBy || "Admin") 
                    .input('createdAt', sql.DateTime, formData.createdAt)
                    .output('NewID', sql.NVarChar(255))  
                    .execute('CustomerQuotation_Save_Update');    

                let newId =  result.output.NewID; 
                let encryptedId =  formData.id;
                if(formData.id == '0'){
                     encryptedId =  encryptID(newId);
                    console.log(encryptedId); 
                    await pool.request()
                    .query(`
                        UPDATE CustomerQuotation 
                        SET Id2 = '${encryptedId}' 
                        WHERE Id = ${newId}
                    `);
                }
                let attachments = null;
                if(Array.isArray(req.files?.attachments)){
                    attachments = req.files["attachments"]
                        ? await Promise.all(req.files["attachments"].map(file => uploadDocument(file).then((res)=>{return res})))
                        : []; 
                }
                if(attachments){
                    await saveQuotationDocuments(pool,attachments,encryptedId,formData);
                }
                if(formData.itemsFormData){
                    quotationItemSaveUpdate(req,encryptedId);
                }
                res.status(200).json({
                    message: 'Customer saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of quotationSaveUpdate

async function quotationItemSaveUpdate(req,QuotationId){
    const formData = req.body; 
    const itemsFormData = JSON.parse(formData.itemsFormData); 
    try {
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (itemsFormData) {
                    for (let itemFormData of itemsFormData) {  
                        if(itemFormData.name){
                            let result = await pool.request()
                                .input('ID2', sql.NVarChar(350), itemFormData.Id2)
                                .input('quotationId', sql.NVarChar(355), QuotationId) 
                                .input('type', sql.NVarChar(50), itemFormData.type)
                                .input('name', sql.NVarChar(255), itemFormData.name)
                                .input('description', sql.NVarChar(sql.MAX), itemFormData.description)
                                .input('qty', sql.Int, itemFormData.qty)
                                .input('unit', sql.NVarChar(50), itemFormData.unit)
                                .input('rate', sql.Decimal(18,2), itemFormData.rate)
                                .input('discount', sql.Decimal(18,2), itemFormData.discount)
                                .input('totalAmount', sql.Decimal(18,2), itemFormData.totalAmount)
                                .output('NewID', sql.NVarChar(255)) 
                                .execute('CustomerQuotationItem_Save_Update');
                        }
                    }  
                } 
                return true;
                
            } catch (err) { 
                throw new Error(err.message);
            }  
        } catch (error) { 
            throw new Error(error.message);
        }
}
// end of quotationItemSaveUpdate
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

async function saveQuotationDocuments(pool,attachmentUrls,NewID,formData){ 

    try { 
        if (attachmentUrls.length > 0) {
            for (let url of attachmentUrls) { 
                  
                await pool.request()
                    .input("ID2", sql.NVarChar, "0")  
                    .input("QuotationId", sql.NVarChar(360), NewID)  
                    .input("DocumentName", sql.NVarChar, url.fileName)  
                    .input("DocumentUrl", sql.NVarChar, url.fileUrl)  
                    .input("CreatedBy", sql.NVarChar,formData.createdBy )
                    .input("CreatedAt", sql.DateTime, formData.createdAt)
                    .execute("CustomerQuotationDocument_SaveOrUpdate");
            }
        } 

    } catch (error) {
        console.error(error);
        throw new Error(error.message);
    }
}
// end of saveQuotationDocuments

const getQuotationList = async (req, res) => {  
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec getQuotationList`; 
        const apiResponse = await pool.request().query(query); 
        const formatCreatedAt = (createdAt) => {
            const date = new Date(createdAt);
            return date.toLocaleDateString("en-US");
        };
        
        let formatedData = apiResponse.recordset.map(staff => ({
            ...staff
            // CreatedAt: formatCreatedAt(staff.CreatedAt),
            // ChangedAt: formatCreatedAt(staff.ChangedAt), 
        })); 
        formatedData = formatedData.map(({ ID, ...rest }) => rest);

        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Customer List loaded successfully!`,
            data: formatedData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getQuotationList
const getQuotationDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec getQuotationDetails '${Id}'`; 
        const apiResponse = await pool.request().query(query);  
        const itemsQuery = `exec GetQuotationItemsList '${Id}'`; 
        const itemsQueryResponse = await pool.request().query(itemsQuery); 
        let customer = null;
        if(apiResponse.recordset){
            const customerId = apiResponse.recordset[0]?.customerId || '0'; 
            const customerQuery = `exec GetCustomerDetails '${customerId}'`; 
            const customerQueryResponse = await pool.request().query(customerQuery); 
            customer = customerQueryResponse.recordset[0]; 
        }
        

        let letResponseData = {};
        if(apiResponse.recordset){
            // letResponseData = apiResponse.recordset[0];
            letResponseData = {
                quotationDetails: apiResponse.recordset[0],
                items: itemsQueryResponse.recordset,
                customer: customer,
            }
        }  
        res.status(200).json({
            message: `quotations details loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getQuotationDetails
const deleteQuotationItem = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec DeleteQuotationItem '${Id}'`; 
        const apiResponse = await pool.request().query(query); 
       
        // const contactsQuery = `exec GetCustomerContactsList '${Id}'`; 
        // const contactsQueryResponse = await pool.request().query(contactsQuery); 
         
        res.status(200).json({
            message: `Quotation Item Deleted successfully!`,
            data: null
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of deleteQuotationItem
const getQuotationDocuments = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec getQuotationDocuments '${Id}'`; 
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
// end of getQuotationDocuments
const getQuotationStatus = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec CustomerQuotationStatus_Get `; 
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Quotation status successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getQuotationStatus
const quotationChangeStatus = async (req, res) => {  
    const {Id,StatusId} = req.body; // user data sent from client
    
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec ChangeStatus_CustomerQuotation '${Id}', '${StatusId}'`; 
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Quotation status updated successfully!`,
            data: null
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of quotationChangeStatus

module.exports =  {quotationChangeStatus,getQuotationStatus,deleteQuotationItem,quotationSaveUpdate,getQuotationList,getQuotationDetails,getQuotationDocuments} ;
