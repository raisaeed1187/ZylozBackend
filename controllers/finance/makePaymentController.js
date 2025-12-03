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

  
const makePaymentSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    
    let pool, transaction;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            pool = await sql.connect(config);
            transaction = new sql.Transaction(pool);

            await setTenantContext(pool,req);

            
            await transaction.begin();
            
            const request = new sql.Request(transaction);
              
             
            const result = await request
            .input('ID2', sql.NVarChar(65), formData.ID2 || '0')
            .input('MakePaymentCode', sql.NVarChar(100), formData.makePaymentCode || null)
            .input('VendorId', sql.NVarChar(65), formData.vendorId || null)
            .input('BranchId', sql.NVarChar(65), formData.branchId || null)
            .input('Currency', sql.NVarChar(10), formData.currency || 'AED')
            .input('MakePaymentDate', sql.Date, formData.makePaymentDate || null)
            .input('PaymentAmount', sql.Decimal(18, 8), formData.paymentAmount || 0.00)
            .input('PaymentMode', sql.NVarChar(100), formData.paymentMode || null)
            .input('PaymentThrough', sql.NVarChar(100), formData.paymentThrough || null)
            .input('ReferenceNo', sql.NVarChar(100), formData.referenceNo || null)
            .input('Remarks', sql.NVarChar(sql.MAX), formData.remarks || null)
            .input('StatusId', sql.Int, formData.statusId || 1)
            .input('TotalItems', sql.Int, formData.totalItems || 0)
            .input('TotalAmount', sql.Decimal(18, 8), formData.totalAmount || 0.00)
            .input('OrganizationId', sql.NVarChar(65), formData.organizationId)
            .input('CreatedBy', sql.NVarChar(100), req.authUser.username )
            .input('BaseCurrencyRate', sql.Decimal(18, 8), formData.baseCurrencyRate || 0.00) 
            .input('PostingDate', sql.Date, formData.postingDate || null)
            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
    
            .output('ID', sql.NVarChar(100))
            .execute('FinMakePayment_SaveOrUpdate');


            const newID = result.output.ID;
            if(formData.makePaymentItems){ 
                makePaymentItemSaveUpdate(req,newID,transaction)
            }
            await transaction.commit();

            res.status(200).json({
                message: 'makePayment saved/updated',
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
}
// end of makePaymentSaveUpdate
 
async function makePaymentItemSaveUpdate(req,makePaymentId,transaction){
    const formData = req.body; 
    const makePaymentItems = JSON.parse(formData.makePaymentItems); 
    try {
             
            try { 
                if (makePaymentItems) {
                    for (let item of makePaymentItems) {  

                        if(item.billId && parseFloat(item.paymentAmount) > 0){ 

                            const itemRequest = new sql.Request(transaction);
                            
                            console.log('item :',item);
                            // console.log('makePaymentId :',makePaymentId);

                           await itemRequest
                            .input('ID2', sql.NVarChar(65), item.ID2 || null)
                            .input('MakePaymentId', sql.NVarChar(65), makePaymentId || null)
                            .input('BillId', sql.NVarChar(65), item.billId || null)
                            .input('BillDate', sql.Date, item.billDate || null)
                            .input('BillNo', sql.NVarChar(100), item.billNo || null)
                            .input('PoNo', sql.NVarChar(100), item.poNo || null)
                            .input('BillAmount', sql.Decimal(18, 8), item.billAmount != null ? (item.billAmount  || '0').toString().replace(/,/g, '') : 0)
                            .input('AmountDue', sql.Decimal(18, 8), item.amountDue != null ? (item.amountDue  || '0').toString().replace(/,/g, '') : 0)
                            .input('PaymentMadeOn', sql.Date, item.paymentMadeOn || null)
                            .input('PaymentAmount', sql.Decimal(18, 8), item.paymentAmount != null ?  (item.paymentAmount  || '0').toString().replace(/,/g, '') : 0)
                            .input('Remarks', sql.NVarChar(sql.MAX), item.remarks || null)
                            .input('CreatedBy', sql.NVarChar(100), req.authUser.username || 'system')
                            .input('Currency', sql.NVarChar(100), item.currency || null) 
                            .input('BankCurrencyPayment', sql.Decimal(18, 8), parseFloat( (item.bankCurrencyPayment  || '0').toString().replace(/,/g, '')) || 0.00)
                            .input('BaseCurrencyRate', sql.Decimal(18, 8), parseFloat(item.baseCurrencyRate) || 0.00)
                            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  

                            .execute('FinMakePaymentItem_SaveOrUpdate');

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
// end of makePaymentItemSaveUpdate

 
 
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
 
const getMakePaymentDetails = async (req, res) => {  
    const {Id,organizationId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
 
        query = `exec FinMakePayment_Get '${Id}','${organizationId}'`;   
        const apiResponse = await pool.request().query(query);

        const itemsQuery = `exec FinMakePaymentItem_Get Null,'${Id}'`;
        const itemsApiResponse = await pool.request().query(itemsQuery);

        const jouralLedgerQuery = `exec FinJournalLedger_Get null,'${Id}','Make Payment'`;
        const jouralLedgerApiResponse = await pool.request().query(jouralLedgerQuery);


        const data = {
            makePaymentDetails: apiResponse.recordset[0],
            makePaymentItems: itemsApiResponse.recordset,
            jouralLedgers: jouralLedgerApiResponse.recordset,  

        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `MakePayment details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getMakePaymentDetails

const getMakePaymentItems = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
 
       
        const itemsQuery = `exec PurchaseItem_Get '${Id}',1`;   
        console.log('itemsQuery');
        console.log(itemsQuery);

        const itemsApiResponse = await pool.request().query(itemsQuery); 
          
        res.status(200).json({
            message: `MakePayment details loaded successfully!`,
            data: itemsApiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getMakePaymentItems
 

const getMakePaymentsList = async (req, res) => {  
    const {organizationId,Id,vendorId} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
        
        if (vendorId) {
            query = `exec finMakePaymentGet Null,'${organizationId}','${vendorId}'`;   
        }else{
            query = `exec FinMakePayment_Get Null,'${organizationId}'`;   

        }  
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `MakePayments List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getMakePaymentsList

 
 


module.exports =  {makePaymentSaveUpdate,getMakePaymentsList,getMakePaymentDetails,getMakePaymentItems} ;
