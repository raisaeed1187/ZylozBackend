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

  
const creditNoteSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
              
             
            const result = await pool.request()
            .input('ID2', sql.NVarChar(65), formData.ID2 || '0')
            .input('CreditNoteCode', sql.NVarChar(100), formData.creditNoteCode || null)
            .input('ReferenceNo', sql.NVarChar(100), formData.referenceNo || null)
            .input('CustomerId', sql.NVarChar(65), formData.customerId || null)
            .input('BranchId', sql.NVarChar(65), formData.branchId || null)
            .input('ProjectId', sql.NVarChar(65), formData.projectId || null)
            .input('Currency', sql.NVarChar(10), formData.currency || 'AED')
            .input('Notes', sql.NVarChar(sql.MAX), formData.notes || null)
            .input('CreditNoteDate', sql.NVarChar(100), formData.creditNoteDate || new Date())
            .input('StatusId', sql.Int, formData.statusId || 1)
            .input('TotalItems', sql.Int, formData.totalItems || 0)
            .input('TotalAmount', sql.Decimal(18, 8), formData.totalAmount || 0.00)
            .input('OrganizationId', sql.NVarChar(65), formData.organizationId)
            .input('CreatedBy', sql.NVarChar(100), formData.createdBy)
            .input('baseCurrencyRate', sql.Decimal(18, 8), formData.baseCurrencyRate || 0.00)
            .input('Emirate', sql.NVarChar(65), formData.emirate || null)   
            .input('PostingDate', sql.Date, formData.postingDate || null)
            .output('ID', sql.NVarChar(100)) // OUTPUT param from procedure
            .execute('FinCreditNote_SaveOrUpdate');

            const newID = result.output.ID;
            if(formData.creditNoteItems){ 
                await creditNoteItemSaveUpdate(req,newID);
                const result = await pool.request() 
                    .input('CreditNoteId', sql.NVarChar(65), newID) 
                    .execute('CreditNote_Create_JournalEntries');

            }

            res.status(200).json({
                message: 'creditNote saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of creditNoteSaveUpdate
 
async function creditNoteItemSaveUpdate(req,creditNoteId){
    const formData = req.body; 
    const creditNoteItems = JSON.parse(formData.creditNoteItems); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (creditNoteItems) {
                    for (let item of creditNoteItems) {  
                        if(item.account){ 
                           await pool.request()
                            .input('ID2', sql.NVarChar(65), item.ID2 || '0') // Use '0' for insert
                            .input('CreditNoteId', sql.NVarChar(65), creditNoteId)
                            .input('Account', sql.NVarChar(100), item.account || null)
                            .input('Description', sql.NVarChar(255), item.description || null)
                            .input('Currency', sql.NVarChar(10), item.currency || null)
                            .input('Qty', sql.Decimal(18, 8), parseFloat(item.qty) || 1)
                            .input('Price', sql.Decimal(18, 8), parseFloat(item.price) || 0)
                            .input('Vat', sql.Decimal(5, 2), parseFloat(item.vat) || 0)
                            .input('VatName', sql.NVarChar(100), item.vatName || null)
                            .input('VatId', sql.NVarChar(100), (item.vatId || '0').toString()) 
                            .input('VatAmount', sql.NVarChar(100), (item.vatAmount || '0').toString().replace(/,/g, ''))
                            .input('NetAmount', sql.NVarChar(100), (item.netAmount || '0').toString().replace(/,/g, ''))
                            .input('CostCenter', sql.NVarChar(65), item.costCenter || null)
                            .input('CorporateTax', sql.NVarChar(100), item.corporateTax || null)
                            .input('Remarks', sql.NVarChar(sql.MAX), item.remarks || null)
                            .input('CreatedBy', sql.NVarChar(100), formData.createdBy || 'system')  
                            .execute('FinCreditNoteItem_SaveOrUpdate');

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
// end of creditNoteItemSaveUpdate

const applycreditNoteOnInvoice = async (req,res)=>{
    const formData = req.body; 
     
    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            // console.log('formData');
            // console.log(formData); 
              
            const pool = await sql.connect(config);
            const allocations = JSON.parse(formData.allocations); 
              
             
             if (allocations) {
                    for (let item of allocations) {  
                        if(item.creditNoteId){ 
                           await pool.request()
                            .input('ID2', sql.NVarChar(65), item.ID2 || '0') // Use '0' for insert
                            .input('creditNoteId', sql.NVarChar(65), item.creditNoteId)
                            .input('invoiceId', sql.NVarChar(100), item.invoiceId || null)
                            .input('invoiceNo', sql.NVarChar(100), item.invoiceNo || null) 
                            .input('appliedAmount', sql.Decimal(18, 8), parseFloat(item.appliedAmount) || 0)
                            .input('appliedBy', sql.NVarChar(100), req.authUser.username)  
                            .input('account', sql.NVarChar(100), item.account || '')   
                            .execute('FinCreditNoteAppliedInvoice_SaveOrUpdate');
                        }
                    } 
                }

            res.status(200).json({
                message: 'Apply creditNote saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of applycreditNoteOnInvoice
 
 
 
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
 
const getCreditNoteDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        query = `exec FinCreditNote_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);

        const itemsQuery = `exec FinCreditNoteItem_Get Null,'${Id}'`;
        const itemsApiResponse = await pool.request().query(itemsQuery);

        const jouralLedgerQuery = `exec FinJournalLedger_Get null,'${Id}','Credit Note'`;
        const jouralLedgerApiResponse = await pool.request().query(jouralLedgerQuery);


        const data = {
            creditNoteDetails: apiResponse.recordset[0],
            creditNoteItems: itemsApiResponse.recordset,
            jouralLedgers: jouralLedgerApiResponse.recordset, 

        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `CreditNote details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCreditNoteDetails

const getCreditNoteItems = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
       
        const itemsQuery = `exec PurchaseItem_Get '${Id}',1`;   
        console.log('itemsQuery');
        console.log(itemsQuery);

        const itemsApiResponse = await pool.request().query(itemsQuery); 
          
        res.status(200).json({
            message: `CreditNote details loaded successfully!`,
            data: itemsApiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCreditNoteItems
 

const getCreditNotesList = async (req, res) => {  
    const {organizationId,Id,IsForPO} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec FinCreditNote_Get Null,'${organizationId}'`;   
          
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `CreditNotes List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCreditNotesList

const getJournalLedgers = async (req, res) => {  
    const {organizationId,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec FinJournalLedger_Get Null,Null,'${organizationId}'`;   
         
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Journal Ledger loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getJournalLedgers

const getAppliedCreditInvoicesList = async (req, res) => {  
    const {creditNoteId,customerId} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        
          
        const response = await pool
                    .request()
                    .input("ID2", sql.NVarChar, null)
                    .input("creditNoteId", sql.NVarChar, creditNoteId || null) 
                    .execute("FinCreditNoteAppliedInvoice_Get");

        res.status(200).json({
            message: `Credit Note Applied Invoice List loaded successfully!`,
            data:  response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAppliedCreditInvoicesList

const deleteAppliedInvoiceFromCreditNote = async (req, res) => {  
    const {creditNoteId,invoiceId,customerId} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
         const response = await pool
                    .request()
                    .input("appliedInvoiceId", sql.NVarChar, invoiceId)
                    .input("currentUser", sql.NVarChar, req.authUser.username) 
                    .execute("FinCreditNoteAppliedInvoice_Delete");

        res.status(200).json({
            message: `Credit Note Applied Invoice Deleted successfully!`,
            data:  response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of deleteAppliedInvoiceFromCreditNote

 


module.exports =  {deleteAppliedInvoiceFromCreditNote,getAppliedCreditInvoicesList,applycreditNoteOnInvoice,getJournalLedgers,creditNoteSaveUpdate,getCreditNotesList,getCreditNoteDetails,getCreditNoteItems} ;
