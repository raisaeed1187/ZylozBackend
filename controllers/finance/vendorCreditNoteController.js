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

  
const vendorCreditNoteSaveUpdate = async (req,res)=>{
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
            .input('VendorId', sql.NVarChar(65), formData.vendorId || null)
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
            .input('BaseCurrencyRate', sql.Decimal(18, 8), formData.baseCurrencyRate)
            .input('Emirate', sql.NVarChar(65), formData.emirate || null)  
            .input('PostingDate', sql.Date, formData.postingDate || null) 
            .output('ID', sql.NVarChar(100))  
            .execute('FinVendorCreditNote_SaveOrUpdate');

            const newID = result.output.ID;
            if(formData.creditNoteItems){ 
                await creditNoteItemSaveUpdate(req,newID)
                const result = await pool.request() 
                    .input('CreditNoteId', sql.NVarChar(65), newID) 
                    .execute('VendorCreditNote_Create_JournalEntries');
                
            }

            res.status(200).json({
                message: 'vendor creditNote saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of vendorCreditNoteSaveUpdate
 
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
                            .input('CorporateTax', sql.NVarChar(65), item.corporateTax || null)
                            .input('Remarks', sql.NVarChar(sql.MAX), item.remarks || null)
                            .input('CreatedBy', sql.NVarChar(100), formData.createdBy || 'system')  
                            .execute('FinVendorCreditNoteItem_SaveOrUpdate');

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

const applyVendorCreditNoteOnInvoice = async (req,res)=>{
    const formData = req.body; 
     
    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
            const allocations = JSON.parse(formData.allocations); 
              
             
             if (allocations) {
                    for (let item of allocations) {  
                        if(item.creditNoteId){ 
                           await pool.request()
                            .input('ID2', sql.NVarChar(65), item.ID2 || '0') // Use '0' for insert
                            .input('creditNoteId', sql.NVarChar(65), item.creditNoteId)
                            .input('billId', sql.NVarChar(100), item.billId || null)
                            .input('billNo', sql.NVarChar(100), item.billNo || null) 
                            .input('appliedAmount', sql.Decimal(18, 8), parseFloat(item.appliedAmount) || 0)
                            .input('appliedBy', sql.NVarChar(100), formData.createdBy || 'system')  
                            .execute('FinVendorCreditNoteAppliedInvoice_SaveOrUpdate');
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
// end of applyVendorCreditNoteOnInvoice
 
 
 
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
 
const getVendorCreditNoteDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        query = `exec FinVendorCreditNote_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);

        const itemsQuery = `exec FinVendorCreditNoteItem_Get Null,'${Id}'`;
        const itemsApiResponse = await pool.request().query(itemsQuery);

        const jouralLedgerQuery = `exec FinJournalLedger_Get null,'${Id}','Received Payment'`;
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
// end of getVendorCreditNoteDetails
 

const getVendorCreditNotesList = async (req, res) => {  
    const {organizationId,Id,IsForPO} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec FinVendorCreditNote_Get Null,'${organizationId}'`;   
          
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Vendor CreditNotes List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getVendorCreditNotesList
 
const getAppliedVendorCreditInvoicesList = async (req, res) => {  
    const {creditNoteId,customerId} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec FinVendorCreditNoteAppliedInvoice_Get Null,'${creditNoteId}'`;   
          
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Vendor Credit Note Applied Invoice List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAppliedVendorCreditInvoicesList

 


module.exports =  {getAppliedVendorCreditInvoicesList,applyVendorCreditNoteOnInvoice,vendorCreditNoteSaveUpdate,getVendorCreditNotesList,getVendorCreditNoteDetails} ;
