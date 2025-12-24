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
const { helper } = require("../helper");
const { setTenantContext } = require("../helper/db/sqlTenant");
const { sendEmail } = require("../services/mailer");


const SECRET_KEY = process.env.SECRET_KEY;

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "documents";
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

  
const quotationSaveUpdate = async (req,res)=>{
    const formData = req.body;

    let pool, transaction;


    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            try { 
                pool = await sql.connect(config);
                transaction = new sql.Transaction(pool);
     
                await setTenantContext(pool,req);
     
                 
                await transaction.begin(); 
                  
                const request = new sql.Request(transaction);
                
                 
                const result = await request
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
                    .input('OrganizationId', sql.NVarChar(500), formData.organizationId || '' ) 
                    .input('BranchID', sql.NVarChar(500), formData.branchId || '' ) 
                    .input('currency', sql.NVarChar(500), formData.currency || '' ) 
                    .input('statusId', sql.NVarChar(50), formData.statusId || '' )  
                    .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  

  
                    .output('NewID', sql.NVarChar(255))  
                    .execute('CustomerQuotation_Save_Update');    

                let newId =  result.output.NewID; 
                let encryptedId =  formData.id;
                if(formData.id == '0'){
                     encryptedId =  newId;
                    //  encryptedId =  encryptID(newId);

                    console.log(encryptedId); 
                    // await pool.request()
                    // .query(`
                    //     UPDATE CustomerQuotation 
                    //     SET Id2 = '${encryptedId}' 
                    //     WHERE Id = ${newId}
                    // `);
                }
                let attachments = null;
                if(Array.isArray(req.files?.attachments)){
                    attachments = req.files["attachments"]
                        ? await Promise.all(req.files["attachments"].map(file => uploadDocument(file).then((res)=>{return res})))
                        : []; 
                }
                if(attachments){
                    await saveQuotationDocuments(pool,attachments,encryptedId,formData,transaction);
                }
                if(formData.itemsFormData){
                    await quotationItemSaveUpdate(req,encryptedId,transaction);
                }

                await transaction.commit();

                res.status(200).json({
                    message: 'Customer saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                console.error("SQL ERROR DETAILS:", err);
                if (transaction) try { await transaction.rollback(); } catch(e) {}
                
                return res.status(400).json({ 
                    message: err.message,
                    // sql: err.originalError?.info || err
                }); 
            }
             
        } catch (err) { 
            console.error("SQL ERROR DETAILS:", err);
            if (transaction) try { await transaction.rollback(); } catch(e) {}
            
            return res.status(400).json({ 
                message: err.message,
                // sql: err.originalError?.info || err
            }); 
        }
}
// end of quotationSaveUpdate

async function quotationItemSaveUpdate(req,QuotationId,transaction){
    const formData = req.body; 
    const itemsFormData = JSON.parse(formData.itemsFormData); 
    try {
             
            try { 
                if (itemsFormData) {
                    for (let itemFormData of itemsFormData) {  
                        if(itemFormData.description){
                            const itemRequest = new sql.Request(transaction);
                            
                            let result = await itemRequest
                                .input('ID2', sql.NVarChar(350), itemFormData.Id2)
                                .input('quotationId', sql.NVarChar(355), QuotationId) 
                                .input('type', sql.NVarChar(50), itemFormData.type)
                                .input('name', sql.NVarChar(255), itemFormData.name)
                                .input('description', sql.NVarChar(sql.MAX), itemFormData.description)
                                .input('qty', sql.Int, itemFormData.qty)
                                .input('unit', sql.NVarChar(50), itemFormData.unit)
                                .input('rate', sql.Decimal(18,5), itemFormData.rate)
                                .input('discount', sql.Decimal(18,5), itemFormData.discount)
                                .input('totalAmount', sql.Decimal(18,5), itemFormData.totalAmount)
                                .input('Vat', sql.Decimal(18,5), itemFormData.vat)
                                .input('VatName', sql.NVarChar(100), itemFormData.vatName)
                                .input('VatId', sql.NVarChar(100), itemFormData.vatId)
                                .input('VatAmount', sql.Decimal(18,5), itemFormData.vatAmount)
                                .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )    
                                .input('CreatedBy', sql.NVarChar(100), req.authUser.username )

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

async function saveQuotationDocuments(pool,attachmentUrls,NewID,formData,transaction){ 

    try { 
        if (attachmentUrls.length > 0) {
            for (let url of attachmentUrls) { 
                const itemRequest = new sql.Request(transaction);
                  
                await itemRequest
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
    const {organizationId,IsActive} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        await setTenantContext(pool,req);

        var result = null;  
        if (IsActive) {
            result = await pool.request()
            .input('OrganizationId', sql.NVarChar(65), organizationId || null)   
            .execute('GetActiveQuotationList');
        }else{
            result = await pool.request()
                .input('OrganizationId', sql.NVarChar(65), organizationId || null)   
                .execute('getQuotationList');
        }
    
        

        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Quotations List loaded successfully!`,
            data: result.recordset
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
        await setTenantContext(pool,req);
          

        const query = `exec getQuotationDetails '${Id}'`; 
        // console.log('query');
        // console.log(query)

        const apiResponse = await pool.request().query(query);  
        const itemsQuery = `exec GetQuotationItemsList '${Id}'`; 
        const itemsQueryResponse = await pool.request().query(itemsQuery); 
        let customer = null;
        // if(apiResponse.recordset){
        //     const customerId = apiResponse.recordset[0]?.customerId || '0'; 
        //     const customerQuery = `exec GetCustomerDetails '${customerId}'`; 
        //     const customerQueryResponse = await pool.request().query(customerQuery); 
        //     customer = customerQueryResponse.recordset[0]; 
        // }
        

        let letResponseData = {};
        if(apiResponse.recordset){
            let isApprover = false;
            let isTransectionHasApprovals = false;

            // console.log(`exec Approval_IsUserApprover '${req.authUser.ID2}','${Id}','Quotation' `);
            const checkIsApproverResponse = await pool.request().query(`exec Approval_IsUserApprover '${req.authUser.ID2}','${Id}','Quotation' `); 
                
            // console.log(checkIsApproverResponse.recordset);
            if (checkIsApproverResponse.recordset.length > 0) {
                isApprover = checkIsApproverResponse.recordset[0].IsApprover;
                isTransectionHasApprovals = checkIsApproverResponse.recordset[0].IsTransectionHasApprovals;
            }

            // console.log('apiResponse.recordset[0].logo');
            // console.log(apiResponse.recordset[0]);
            // console.log(apiResponse.recordset[0].logo);


            const logoBase64 = await helper.methods.urlToBase64(apiResponse.recordset[0].logo);
            // console.log('logoBase64');
            // console.log(logoBase64);

            // letResponseData = apiResponse.recordset[0];
            const quotationDetails = {
                ...apiResponse.recordset[0],
                isApprover: isApprover,
                isTransectionHasApprovals:isTransectionHasApprovals,
                logo: logoBase64  
            };

         
            letResponseData = {
                quotationDetails: quotationDetails,
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
          await setTenantContext(pool,req);
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
          await setTenantContext(pool,req);
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
          await setTenantContext(pool,req);
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

const sendQuotation = async (req, res) => {
  const formData = req.body;

  let pool;
  let transaction;
    console.log('sendQuotation formData');
    console.log(formData);
  try {
    if (!formData.to || !formData.pdfBase64 || !formData.fileName) {
      return res.status(400).json({
        message: "Required fields missing",
      });
    }

    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));

    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    transaction = new sql.Transaction(pool);

    await setTenantContext(pool, req);
    await transaction.begin();

    const pdfBuffer = Buffer.from(formData.pdfBase64, "base64");

    const attachments = [
      {
        filename: formData.fileName,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ];

    const to = Array.isArray(formData.to)
      ? formData.to.join(",")
      : formData.to;

    const cc = Array.isArray(formData.cc)
      ? formData.cc.join(",")
      : formData.cc || [];

    const bcc = Array.isArray(formData.bcc)
      ? formData.bcc.join(",")
      : formData.bcc || [];

    const subject = formData.subject || "Quotation "+formData.quotationNo;
    const text = "Please find attached the quotation.";
    const html = formData.body || null;

    await sendEmail(
      to,
      subject,
      text,
      html,
      attachments,
      cc,
      bcc
    );
    const request = new sql.Request(transaction);

    const { ID2, statusId, organizationId } = formData;

    request.input("ID2", sql.NVarChar(65), ID2);  
    request.input("StatusId", sql.Int, statusId || null);
    request.input("OrganizationID", sql.NVarChar(65), organizationId);
    request.input("CurrentUser", sql.NVarChar(65), req.authUser.username);
    request.input("IsNewLog", sql.Bit, 1); 
    const apiResponse = await request.execute("CustomerQuotation_Change_Status");
    

    await transaction.commit();

    return res.status(200).json({
      message: "Quotation sent successfully",
    });
  } catch (err) {
    console.error("SEND Quotation ERROR:", err);

    if (transaction) {
      try {
        await transaction.rollback();
      } catch (_) {}
    }

    return res.status(500).json({
      message: err.message,
    });
  }
};
// end of sendQuotation

module.exports =  {sendQuotation,quotationChangeStatus,getQuotationStatus,deleteQuotationItem,quotationSaveUpdate,getQuotationList,getQuotationDetails,getQuotationDocuments} ;
