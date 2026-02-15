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
const { helper } = require("../../helper");


const SECRET_KEY = process.env.SECRET_KEY;

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "documents";
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

  
const expenseSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    
    let pool, transaction;


    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
            // const files = req.files || []; 
            // console.log('files');  
            // console.log(files);  

            pool = await sql.connect(config);
            transaction = new sql.Transaction(pool);

            await setTenantContext(pool,req);

            
            await transaction.begin();
            
            const request = new sql.Request(transaction);
              
            
            if (parseBoolean(formData.isPettyCash) ||formData.isPettyCash == 1) {
                if(formData.expenseItems){ 
                    var newID = 0;
                    // expenseItemSaveUpdate(req,newID)
                    console.log('isPettyCash');
                    await pettyCashSaveUpdate(req,res,transaction);
                }
            }else{
                console.log('else conditions');
                const result = await request
                .input('ID2', sql.NVarChar(65), formData.ID2 || '0')
                .input('expenseCode', sql.NVarChar(100), formData.expenseCode || null)
                .input('vendorId', sql.NVarChar(65), formData.vendorId || null)
                .input('expenseAccount', sql.NVarChar(100), formData.expenseAccount || null)
                .input('branchId', sql.NVarChar(65), formData.branchId || null)
                .input('expenseDate', sql.NVarChar(100), formData.expenseDate || new Date())
                .input('expenseAmount', sql.Decimal(18, 8), formData.expenseAmount || 0.00)
                .input('paymentMode', sql.NVarChar(65), formData.paymentMode || null)
                .input('paymentThrough', sql.NVarChar(100), formData.paymentThrough || null)
                .input('project', sql.NVarChar(100), formData.project || null)
                .input('costCenterId', sql.NVarChar(65), formData.costCenterId || null)
                .input('referenceNo', sql.NVarChar(100), formData.referenceNo || null)
                .input('remarks', sql.NVarChar(sql.MAX), formData.remarks || null)
                .input('statusId', sql.Int, formData.statusId || 1)
                .input('isBulkExpense', sql.Bit, parseBoolean(formData.isBulkExpense) || false)
                .input('billable', sql.Bit, parseBoolean(formData.billable) || false)
                .input('organizationId', sql.NVarChar(65), formData.organizationId || null)
                .input('currency', sql.NVarChar(10), formData.currency || 'AED')
                .input('createdBy', sql.NVarChar(100), req.authUser.username || null)  
                .input('isPettyCash', sql.Bit, parseBoolean(formData.isPettyCash) || false)
                .input('emirate', sql.NVarChar(100), formData.emirate || null)
                .input('description', sql.NVarChar(300), formData.description || null)
                .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  

                .output('ID', sql.NVarChar(100))
                .execute('FinExpenses_SaveOrUpdate'); 
                const newID = result.output.ID;

            }
             
            await transaction.commit();
            

            res.status(200).json({
                message: 'vendor expense saved/updated',
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
}
// end of expenseSaveUpdate

async function pettyCashSaveUpdate(req,res,transaction){
    const formData = req.body; 
     if (!transaction) throw new Error('Transaction is undefined');
    try {
             
            
             const request = new sql.Request(transaction);

              
                const result = await request
                .input('ID2', sql.NVarChar(65), formData.ID2 || '0')
                .input('expenseCode', sql.NVarChar(100), formData.expenseCode || null)
                .input('expenseDate', sql.Date, formData.expenseDate || new Date())
                .input('paymentThrough', sql.NVarChar(100), formData.paymentThrough || null)
                .input('statusId', sql.Int, formData.statusId || 1)
                .input('createdBy', sql.NVarChar(100), req.authUser.username || null)
                .input('organizationId', sql.NVarChar(65), formData.organizationId || null) 
                .input('branchId', sql.NVarChar(65), formData.branchId || null)  
                .input('emirate', sql.NVarChar(100), formData.emirate || null)
                .input('currency', sql.NVarChar(100), formData.currency || null)
                .input('baseCurrencyRate', sql.NVarChar(100), formData.baseCurrencyRate || null)  
                .input('postingDate', sql.NVarChar(100), (formData.postingDate && formData.postingDate != 'null') ? formData.postingDate : null || null)
                .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  

                .output('ID', sql.NVarChar(65))
                .execute('FinPettyCashExpense_SaveOrUpdate');

                
                const newID = result.output.ID; 
                if(formData.expenseItems){  
                    await expenseItemSaveUpdate(req,newID,transaction);
                    // const result = await pool.request() 
                            // .input('PettyCashId', sql.NVarChar(65), newID) 
                            // .execute('PettyCash_Create_JournalEntries');
                }
             

            
 

        } catch (err) {
            throw new Error(err.message);
        } 
}
// end of expenseSaveUpdate


function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}

// async function expenseItemSaveUpdate(req,expenseId){
//     const formData = req.body; 
//     const expenseItems = JSON.parse(formData.expenseItems);  

//     try {
//             store.dispatch(setCurrentDatabase(req.authUser.database));
//             store.dispatch(setCurrentUser(req.authUser)); 
//             const config = store.getState().constents.config;   

//             const pool = await sql.connect(config);
//             try { 
//                 if (expenseItems) {
//                     for (let item of expenseItems) {  
//                         // console.log(item);

//                         if(item.expenseAccount){ 
//                             await pool.request()
//                                 .input('ID2', sql.NVarChar(65), item.ID2 || '0')
//                                 .input('expenseCode', sql.NVarChar(100), item.expenseCode || null)
//                                 .input('vendorId', sql.NVarChar(65), item.vendorId || null)
//                                 .input('expenseAccount', sql.NVarChar(100), item.expenseAccount || null)
//                                 .input('branchId', sql.NVarChar(65), formData.branchId || null)
//                                 .input('expenseDate', sql.NVarChar(100), item.expenseDate || new Date())
//                                 .input('expenseAmount', sql.Decimal(18, 8), item.expenseAmount || 0.00)
//                                 .input('paymentMode', sql.NVarChar(65), item.paymentMode || null)
//                                 .input('paymentThrough', sql.NVarChar(100), item.paymentThrough || null)
//                                 .input('project', sql.NVarChar(100), item.project || null)
//                                 .input('costCenterId', sql.NVarChar(65), item.costCenterId || null)
//                                 .input('referenceNo', sql.NVarChar(100), item.referenceNo || null)
//                                 .input('remarks', sql.NVarChar(sql.MAX), item.remarks || null)
//                                 .input('statusId', sql.Int, item.statusId || 1)
//                                 .input('isBulkExpense', sql.Bit, parseBoolean( item.isBulkExpense) || false)
//                                 .input('billable', sql.Bit, item.billable || false)
//                                 .input('organizationId', sql.NVarChar(65), formData.organizationId || null)
//                                 .input('currency', sql.NVarChar(10), item.currency || 'AED')
//                                 .input('createdBy', sql.NVarChar(100), formData.createdBy || null) 
//                                 .input('isPettyCash', sql.Bit, parseBoolean(formData.isPettyCash) || false) 
//                                 .input('vat', sql.NVarChar(100), (item.vat || '0').toString().replace(/,/g, ''))
//                                 .input('vatName', sql.NVarChar(100), (item.vatName || '0').toString()) 
//                                 .input('vatId', sql.NVarChar(100), (item.vatId || '0').toString()) 
//                                 .input('vatAmount', sql.NVarChar(100), (item.vatAmount || '0').toString().replace(/,/g, ''))
//                                 .input('netAmount', sql.NVarChar(100), (item.netAmount || '0').toString().replace(/,/g, ''))
//                                 .input('pettyCashId', sql.NVarChar(100), expenseId || null)
//                                 .input('emirate', sql.NVarChar(100), formData.emirate || null)
//                                 .input('description', sql.NVarChar(300), item.description || null)
//                                 .input('isVatInclusive', sql.Bit, parseBoolean(item.isVatInclusive) || false)

//                                 .output('ID', sql.NVarChar(100))
//                                 .execute('FinExpenses_SaveOrUpdate'); 

//                         }
//                     } 
//                 }


//             } catch (err) {
//                 throw new Error(err.message);
//             }  
//         } catch (error) { 
//             throw new Error(error.message);
//         }
// }
// // end of expenseItemSaveUpdate
 


 
 
// end of customerContactSaveUpdate



async function expenseItemSaveUpdate(req, expenseId,transaction) {
    const formData = req.body;

    console.log('expenseItemSaveUpdate inside');
    try {

    // Parse all row-wise expense items
    let expenseItems = [];

    if (req.body.expenseItems) {
    // req.body.expenseItems is an object like { '0': '{"ID2":...}', '': '[{...}]' }
    const itemsObj = req.body.expenseItems;

    Object.keys(itemsObj).forEach((key) => {
        const value = itemsObj[key];
 
        if (typeof value === 'string') {
        try {
            expenseItems.push(JSON.parse(value));
        } catch (err) {
            console.error(`Error parsing expense item for key ${key}:`, err);
        }
        } else if (Array.isArray(value)) {
        
        value.forEach(v => {
            try {
            expenseItems.push(typeof v === 'string' ? JSON.parse(v) : v);
            } catch (err) {
            console.error(`Error parsing array expense item for key ${key}:`, err);
            }
        });
        } else if (typeof value === 'object' && value !== null) {
       
        expenseItems.push(value);
        }
    });
    }

        console.log('after expenseItems');
        console.log(expenseItems);

        
        console.log('req.files');
        console.log(req.files);

        // Azure Storage setup
        const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient("expenses");

        for (let rowIdx = 0; rowIdx < expenseItems.length; rowIdx++) {
            const item = expenseItems[rowIdx];
            console.log('loop item');
            console.log(item); 

            if (!item.expenseAccount) continue;

            console.log('after expense account');
             
            console.log('rowFiles');
            const rowFiles = await req.files.filter(f => f.fieldname == `attachments[${rowIdx}]`);
            // console.log(rowFiles);

            let documentUrl = null;
            let documentName = null;


            for (let file of rowFiles) {
                // console.log('inside file loop');
                // const blobName = `expense-${new Date()}-${Date.now()}-${file.originalname}`;
                // const blockBlobClient = containerClient.getBlockBlobClient(blobName);

                // await blockBlobClient.uploadData(file.buffer, {
                //     blobHTTPHeaders: { blobContentType: file.mimetype }
                // });
                // documentUrl = blockBlobClient.url;

                documentUrl = file ? (await uploadDocument(file)).fileUrl : null;
                documentName = file.originalname;
                
                // console.log(documentUrl);
                // console.log(documentName);

                // Optional: save URL in SQL
                // const blobUrl = blockBlobClient.url;
                // await pool.request()
                //     .input('ExpenseId', sql.NVarChar(65), expenseRowId)
                //     .input('FileName', sql.NVarChar(255), file.originalname)
                //     .input('BlobUrl', sql.NVarChar(sql.MAX), blobUrl)
                //     .execute('FinExpensesAttachment_Save'); // create SP to save attachments

            }

            const itemRequest = new sql.Request(transaction);

           
            const result = await itemRequest
                .input('ID2', sql.NVarChar(65), item.ID2 || '0')
                .input('expenseCode', sql.NVarChar(100), item.expenseCode || null)
                .input('vendorId', sql.NVarChar(65), item.vendorId || null)
                .input('expenseAccount', sql.NVarChar(100), item.expenseAccount || null)
                .input('branchId', sql.NVarChar(65), formData.branchId || null)
                .input('expenseDate', sql.NVarChar(100), item.expenseDate || new Date())
                .input('expenseAmount', sql.Decimal(18, 8), item.expenseAmount || 0.0)
                .input('paymentMode', sql.NVarChar(65), item.paymentMode || null)
                .input('paymentThrough', sql.NVarChar(100), item.paymentThrough || null)
                .input('project', sql.NVarChar(100), item.project || null)
                .input('costCenterId', sql.NVarChar(65), item.costCenterId || null)
                .input('referenceNo', sql.NVarChar(100), item.referenceNo || null)
                .input('remarks', sql.NVarChar(sql.MAX), item.remarks || null)
                .input('statusId', sql.Int, formData.statusId || 1)
                .input('isBulkExpense', sql.Bit, parseBoolean(item.isBulkExpense) || false)
                .input('billable', sql.Bit, item.billable || false)
                .input('organizationId', sql.NVarChar(65), formData.organizationId || null)
                .input('currency', sql.NVarChar(10), item.currency || 'AED')
                .input('createdBy', sql.NVarChar(100), req.authUser.username || null)
                .input('isPettyCash', sql.Bit, parseBoolean(formData.isPettyCash) || false)
                .input('vat', sql.NVarChar(100), (item.vat || '0').toString().replace(/,/g, ''))
                .input('vatName', sql.NVarChar(100), (item.vatName || '0').toString())
                .input('vatId', sql.NVarChar(100), (item.vatId || '0').toString())
                .input('vatAmount', sql.NVarChar(100), (item.vatAmount || '0').toString().replace(/,/g, ''))
                .input('netAmount', sql.NVarChar(100), (item.netAmount || '0').toString().replace(/,/g, ''))
                .input('pettyCashId', sql.NVarChar(100), expenseId || null)
                .input('emirate', sql.NVarChar(100), formData.emirate || null)
                .input('description', sql.NVarChar(300), item.description || null)
                .input('isVatInclusive', sql.Bit, parseBoolean(item.isVatInclusive) || false)
                .input('documentName', sql.NVarChar(250), documentName || null)
                .input('documentUrl', sql.NVarChar(sql.MAX), documentUrl || null) 
                .input('billNo', sql.NVarChar(sql.MAX), item.billNo || null)   
                .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
                
                .output('ID', sql.NVarChar(100))
                .execute('FinExpenses_SaveOrUpdate');

            const expenseRowId = result.output.ID;

            
           
        }

    } catch (err) {
        throw new Error(err.message);
    }
}

function encryptID(id) {
  
    const secretKey = process.env.ENCRYPT_SECRET_KEY;   
    const iv = crypto.randomBytes(16);  
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secretKey, 'utf-8'), iv);

    let encrypted = cipher.update(id.toString(), 'utf-8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + encrypted; // Return IV + Encrypted Data
}
// end of encryptID
 
const getExpenseDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
 
        query = `exec FinExpenses_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);

        // const itemsQuery = `exec FinExpenseItem_Get Null,'${Id}'`;
        // const itemsApiResponse = await pool.request().query(itemsQuery);

        const data = {
            expenseDetails: apiResponse.recordset[0],
            // expenseItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Expense details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getExpenseDetails
 
const getExpensesList = async (req, res) => {  
    const {organizationId,Id,isPettyCash} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
         
        query = `exec FinExpenses_Get Null,'${organizationId}',Null,${isPettyCash}`;   
          
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Expenses List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getExpensesList
 

const getPettyCashDetails = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
 
        query = `exec FinPettyCashExpense_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);

        const itemsQuery = `exec FinExpenses_Get Null,Null,Null,1,'${Id}'`;
        console.log('itemsQuery')
        console.log(itemsQuery)

        const itemsApiResponse = await pool.request().query(itemsQuery);

        const jouralLedgerQuery = `exec FinJournalLedger_Get null,'${Id}','Petty Cash'`;
        const jouralLedgerApiResponse = await pool.request().query(jouralLedgerQuery);

        if (apiResponse.recordset.length > 0) {
            const expenseDetails = apiResponse.recordset[0];
            
            const logoBase64 = await helper.methods.urlToBase64(expenseDetails.logo);
             
            
            const invoiceUpdatedDetails = {
                ...expenseDetails,
                logo: logoBase64
            };
    
            const data = {
                expenseDetails: invoiceUpdatedDetails,
                expenseItems: itemsApiResponse.recordset,
                jouralLedgers: jouralLedgerApiResponse.recordset,  
            }
            
            // Return a response (do not return the whole req/res object)
            res.status(200).json({
                message: `Expense details loaded successfully!`,
                data: data
            });
            
        }else{
            return res.status(400).json({ message: 'No record found',data:null});
    

        }

        // const data = {
        //     expenseDetails: apiResponse.recordset[0],
        //     expenseItems: itemsApiResponse.recordset,
        //     jouralLedgers: jouralLedgerApiResponse.recordset,  
        // }
        
        // // Return a response (do not return the whole req/res object)
        // res.status(200).json({
        //     message: `pettyCash details loaded successfully!`,
        //     data: data
        // });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPettyCashDetails
 
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


const getPettyCashExpensesList = async (req, res) => {  
    const {organizationId,Id,isPettyCash} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
         
        query = `exec FinPettyCashExpense_Get Null,'${organizationId}'`;   
          
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Petty Cash Expenses List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPettyCashExpensesList
 
 


module.exports =  {getPettyCashDetails,getPettyCashExpensesList,expenseSaveUpdate,getExpensesList,getExpenseDetails} ;
