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

  
const customerSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                  
                const result = await pool.request()
                    .input('ID2', sql.NVarChar(350), formData.id)
                    .input('CustomerType', sql.NVarChar(250), formData.customerType)
                    .input('Salutation', sql.NVarChar(50), formData.salutation)
                    .input('FullName', sql.NVarChar(255), formData.fullName)
                    .input('DisplayName', sql.NVarChar(255), formData.displayName)
                    .input('CompanyName', sql.NVarChar(255), formData.companyName)
                    .input('Email', sql.NVarChar(255), formData.email)
                    .input('Phone', sql.NVarChar(50), formData.phone)
                    .input('Address', sql.NVarChar(250), formData.address)
                    .input('TRN', sql.NVarChar(250), formData.trn)
                    .input('PaymentTerms', sql.NVarChar(100), formData.paymentTerms)
                    .input('CreatedBy', sql.NVarChar(255), formData.createdBy || "Admin")
                    .input('OrganizationId', sql.NVarChar(255), formData.organizationId)
                     
                    .output('NewID', sql.NVarChar(355)) // Assuming the output is an integer
                    .execute('Customer_Save_Update'); 

                let newId =  result.output.NewID;
                console.log('newId');
                console.log(newId);
                let encryptedId =  formData.id;
                if(formData.id == '0'){
                     encryptedId =  encryptID(newId);
                    console.log(encryptedId); 
                    await pool.request()
                    .query(`
                        UPDATE Customers 
                        SET ID2 = '${encryptedId}' 
                        WHERE ID = ${newId}
                    `);
                }
                let attachments = null;
                if(Array.isArray(req.files?.attachments)){
                    attachments = req.files["attachments"]
                        ? await Promise.all(req.files["attachments"].map(file => uploadDocument(file).then((res)=>{return res})))
                        : []; 
                }
                if(attachments){
                    await saveCustomerDocuments(pool,attachments,encryptedId,formData);
                }
                if(formData.contactFormData){
                    customerContactSaveUpdate(req,encryptedId);
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
// end of customerSaveUpdate

async function customerContactSaveUpdate(req,CustomerId){
    const formData = req.body; 
    const contactFormData = JSON.parse(formData.contactFormData); 
    try {
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (contactFormData) {
                    for (let contactForm of contactFormData) { 
                        let result = await pool.request()
                            .input('ID2', sql.NVarChar, contactForm.Id)
                            .input('CustomerId', sql.NVarChar, CustomerId) 
                            .input('Salutation', sql.NVarChar, contactForm.Salutation)
                            .input('FirstName', sql.NVarChar, contactForm.FirstName)
                            .input('LastName', sql.NVarChar, contactForm.LastName)
                            .input('EmailAddress', sql.NVarChar, contactForm.EmailAddress)
                            .input('WorkPhone', sql.NVarChar, contactForm.WorkPhone)
                            .input('Mobile', sql.NVarChar, contactForm.Mobile)
                            .output('NewID', sql.NVarChar(255)) 
                            .execute('Customer_Contact_Save_Update');
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

async function saveCustomerDocuments(pool,attachmentUrls,NewID,formData){ 

    try { 
        if (attachmentUrls.length > 0) {
            for (let url of attachmentUrls) { 
                  
                await pool.request()
                    .input("ID2", sql.NVarChar, "0") // Assuming 0 for new entry
                    .input("CustomerId", sql.NVarChar, NewID) // Use the ID from the profile
                    .input("DocumentName", sql.NVarChar, url.fileName) // Extract file name
                    .input("DocumentUrl", sql.NVarChar, url.fileUrl) // Store URL
                    .input("CreatedBy", sql.NVarChar,formData.createdBy )
                    .input("CreatedAt", sql.DateTime, formData.createdAt)
                    .execute("CustomerDocument_SaveOrUpdate");
            }
        } 

    } catch (error) {
        console.error(error);
        throw new Error(error.message);
    }
}
// end of saveCustomerDocuments

const getCustomerList = async (req, res) => {  
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec GetCustomerList`; 
        const apiResponse = await pool.request().query(query); 
        const formatCreatedAt = (createdAt) => {
            const date = new Date(createdAt);
            return date.toLocaleDateString("en-US");
        };
        
        // let formatedData = apiResponse.recordset.map(staff => ({
        //     ...staff,
        //     CreatedAt: formatCreatedAt(staff.CreatedAt),
        //     ChangedAt: formatCreatedAt(staff.ChangedAt), 
        // })); 
        // formatedData = formatedData.map(({ ID, ...rest }) => rest);

        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Customer List loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCustomerList
const getCustomerDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec GetCustomerDetails '${Id}'`; 
        const apiResponse = await pool.request().query(query); 
       
        const contactsQuery = `exec GetCustomerContactsList '${Id}'`; 
        const contactsQueryResponse = await pool.request().query(contactsQuery); 
        
        let letResponseData = {};
        if(apiResponse.recordset){
            // letResponseData = apiResponse.recordset[0];
            letResponseData = {
                customerDetails: apiResponse.recordset[0],
                contacts: contactsQueryResponse.recordset,
            }
        }  
        res.status(200).json({
            message: `Customer details loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCustomerDetails
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
const getCustomerDocuments = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec GetCustomerDocuments '${Id}'`; 
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
// end of getCustomerDocuments


module.exports =  {deleteCustomerContact,customerSaveUpdate,getCustomerList,getCustomerDetails,getCustomerDocuments} ;
