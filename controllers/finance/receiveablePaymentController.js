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

  
const paymentSaveUpdate = async (req,res)=>{
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
                .input('PaymentCode', sql.NVarChar(100), formData.paymentCode || null)
                .input('CustomerId', sql.NVarChar(65), formData.customerId || null)
                .input('ReferenceNo', sql.NVarChar(100), formData.referenceNo || null)
                .input('PaymentDate', sql.NVarChar(100), formData.paymentDate || null)
                .input('PaymentMode', sql.NVarChar(50), formData.paymentMode || null)
                .input('AmountReceived', sql.Decimal(18, 8), parseFloat(formData.amountReceived) || 0.00)
                .input('DepositTo', sql.NVarChar(65), formData.depositTo || null)
                .input('Remarks', sql.NVarChar(sql.MAX), formData.remarks || null)
                .input('StatusId', sql.Int, formData.statusId || 1)
                .input('CreatedBy', sql.NVarChar(100), formData.createdBy)
                .input('OrganizationId', sql.NVarChar(100), formData.organizationId || '')
                .input('BranchId', sql.NVarChar(100), formData.branchId || '') 
                .input('Currency', sql.NVarChar(100), formData.currency || '')
                .input('BaseCurrencyRate', sql.NVarChar(100), formData.baseCurrencyRate || '') 
                .input('PostingDate', sql.Date, formData.postingDate || null)
                .output('ID', sql.NVarChar(100))
                .execute('FinReceivedPayment_SaveOrUpdate');

            const newID = result.output.ID;
            if(formData.paymentItems){ 
                paymentItemSaveUpdate(req,newID)
            }

            res.status(200).json({
                message: 'payment saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of paymentSaveUpdate
 
async function paymentItemSaveUpdate(req,paymentId){
    const formData = req.body; 
    const paymentItems = JSON.parse(formData.paymentItems); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (paymentItems) {
                    for (let item of paymentItems) {  
                        console.log(item);
                        if(item.invoiceId && parseFloat(item.payment) > 0 ){  
                            const result = await pool.request()
                            .input('ID2', sql.NVarChar(65), item.ID2 || '0')
                            .input('PaymentId', sql.NVarChar(65), paymentId)
                            .input('InvoiceId', sql.NVarChar(65), item.invoiceId) 
                            .input('InvoiceDate', sql.Date, item.invoiceDate || null)
                            .input('InvoiceNo', sql.NVarChar(100), item.invoiceNo || null)
                            .input('InvoiceAmount', sql.Decimal(18, 8), (item.invoiceAmount || '0').toString().replace(/,/g, ''))
                            .input('DueAmount', sql.Decimal(18, 8), ( item.dueAmount  || '0').toString().replace(/,/g, '') || 0.00)
                            .input('Payment', sql.Decimal(18, 8), (item.payment  || '0').toString().replace(/,/g, '') || 0.00)
                            .input('Remarks', sql.NVarChar(sql.MAX), item.remarks || null) 
                            .input('Currency', sql.NVarChar(100), item.currency || null) 
                            .input('BankCurrencyPayment', sql.Decimal(18, 8), ( item.bankCurrencyPayment || '0').toString().replace(/,/g, '')  || 0.00)
                            .input('BaseCurrencyRate', sql.Decimal(18, 8), parseFloat(item.baseCurrencyRate) || 0.00)

                            .execute('FinReceivedPaymentItem_SaveOrUpdate');
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
// end of paymentItemSaveUpdate

 
 
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
 
const getPaymentDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        query = `exec FinReceivedPayment_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);

        const itemsQuery = `exec FinReceivedPaymentItem_Get '${Id}'`;
        const itemsApiResponse = await pool.request().query(itemsQuery);

        const jouralLedgerQuery = `exec FinJournalLedger_Get null,'${Id}','Received Payment'`;
        const jouralLedgerApiResponse = await pool.request().query(jouralLedgerQuery);



        const data = {
            paymentDetails: apiResponse.recordset[0],
            paymentItems: itemsApiResponse.recordset,
            jouralLedgers: jouralLedgerApiResponse.recordset,  

        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Payment details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPaymentDetails

const getCustomerPayment = async (req, res) => {  
    const {customerId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
       
        const itemsQuery = `exec FinCustomerPayments_Get '${customerId}'`;   
        console.log('itemsQuery');
        console.log(itemsQuery);

        const itemsApiResponse = await pool.request().query(itemsQuery); 
          
        res.status(200).json({
            message: `Payment details loaded successfully!`,
            data: itemsApiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCustomerPayment
 

const getPaymentsList = async (req, res) => {  
    const {Id,organizationId} = req.body;  
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec FinReceivedPayment_Get Null,'${organizationId}'`;   
          
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Payments List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPaymentsList

 


module.exports =  {paymentSaveUpdate,getPaymentsList,getPaymentDetails,getCustomerPayment} ;
