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

  
const invoiceSaveUpdate = async (req,res)=>{
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
            .input('InvoiceCode', sql.NVarChar(100), formData.invoiceCode)
            .input('CustomerId', sql.NVarChar(65), formData.customerId)
            .input('OrderNo', sql.NVarChar(100), formData.orderNo)
            .input('InvoiceDate', sql.Date, formData.invoiceDate)
            .input('PaymentTerms', sql.NVarChar(100), formData.paymentTerms)
            .input('DueDate', sql.NVarChar(100), formData.dueDate)
            .input('JournalId', sql.NVarChar(65), formData.journalId)
            .input('Subject', sql.NVarChar(255), formData.subject)
            .input('TermsAndConditions', sql.NVarChar(sql.MAX), formData.termsAndConditions)
            .input('CustomerNotes', sql.NVarChar(sql.MAX), formData.customerNotes)
            .input('Remarks', sql.NVarChar(sql.MAX), formData.remarks)
            .input('StatusId', sql.Int, formData.statusId || 1)
            .input('TotalItems', sql.Int, formData.totalItems || 0)
            .input('TotalAmount', sql.NVarChar(100), formData.totalAmount || "0.00")
            .input('CreatedBy', sql.NVarChar(100), formData.createdBy)
            .output('ID', sql.NVarChar(100)) // output param
            .execute('FinInvoice_SaveOrUpdate');

            const newID = result.output.ID;
            if(formData.invoiceItems){ 
                invoiceItemSaveUpdate(req,newID)
            }

            res.status(200).json({
                message: 'invoice saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of invoiceSaveUpdate
 
async function invoiceItemSaveUpdate(req,invoiceId){
    const formData = req.body; 
    const invoiceItems = JSON.parse(formData.invoiceItems); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (invoiceItems) {
                    for (let item of invoiceItems) {  
                        console.log(item);
                        if(item.account){  

                            const result = await pool.request()
                            .input('ID2', sql.NVarChar(65), item.ID2)
                            .input('InvoiceId', sql.NVarChar(65), invoiceId)
                            .input('ItemDescription', sql.NVarChar(255), item.itemDescription)
                            .input('Account', sql.NVarChar(100), item.account)
                            .input('Qty', sql.Int, item.qty || 1)
                            .input('Price', sql.NVarChar(100), (item.price || '0').toString().replace(/,/g, ''))
                            .input('DiscountAmount', sql.NVarChar(100), (item.discountAmount || '0').toString().replace(/,/g, ''))
                            .input('Vat', sql.NVarChar(100), (item.Vat || '0').toString().replace(/,/g, ''))
                            .input('VatAmount', sql.NVarChar(100), (item.vatAmount || '0').toString().replace(/,/g, ''))
                            .input('NetAmount', sql.NVarChar(100), (item.netAmount || '0').toString().replace(/,/g, ''))
                            .input('Remarks', sql.NVarChar(sql.MAX), item.remarks || '')
                            .execute('FinInvoiceItem_SaveOrUpdate');

                        }
                    } 
                }


            } catch (err) {
                throw new Error(err.message);
            }  
        } catch (error) { 
            throw new Error(error.message);
        }
}
// end of invoiceItemSaveUpdate

 
 
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
 
const getInvoiceDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        query = `exec FinInvoice_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);

        const itemsQuery = `exec FinInvoiceItem_Get '${Id}'`;
        const itemsApiResponse = await pool.request().query(itemsQuery);

        const data = {
            invoiceDetails: apiResponse.recordset[0],
            invoiceItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Invoice details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getInvoiceDetails

const getCustomerInvoice = async (req, res) => {  
    const {customerId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
       
        const itemsQuery = `exec FinCustomerInvoices_Get '${customerId}'`;   
        console.log('itemsQuery');
        console.log(itemsQuery);

        const itemsApiResponse = await pool.request().query(itemsQuery); 
          
        res.status(200).json({
            message: `Invoice details loaded successfully!`,
            data: itemsApiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCustomerInvoice
 

const getInvoicesList = async (req, res) => {  
    const {Id} = req.body;  
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec FinInvoice_Get`;   
          
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Invoices List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getInvoicesList

 


module.exports =  {invoiceSaveUpdate,getInvoicesList,getInvoiceDetails,getCustomerInvoice} ;
