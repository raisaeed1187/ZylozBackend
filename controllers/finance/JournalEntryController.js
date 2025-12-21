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

  
const journalEntrySaveUpdate = async (req,res)=>{
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
            .input('ID2', sql.NVarChar(65), formData.ID2)
            .input('JournalEntryCode', sql.NVarChar(100), formData.journalEntryCode)  
            .input('ReferenceNo', sql.NVarChar(100), formData.referenceNo)
            .input('Notes', sql.NVarChar(sql.MAX), formData.notes)
            .input('JournalEntryDate', sql.NVarChar(100), formData.journalEntryDate)
            .input('JournalEntryType', sql.NVarChar(50), formData.journalEntryType)
            .input('StatusId', sql.Int, formData.statusId)
            .input('TotalItems', sql.Int, formData.totalItems)
            .input('TotalAmount', sql.NVarChar(100) , formData.totalAmount)
            .input('CreatedBy', sql.NVarChar(100), req.authUser.username)
            .input('OrganizationId', sql.NVarChar(100), formData.organizationId || '')
            .input('BranchId', sql.NVarChar(100), formData.branchId || '') 
            .input('currency', sql.NVarChar(65), formData.currency || null)
            .input('baseCurrencyRate', sql.NVarChar(100), formData.baseCurrencyRate || null) 
            .input('PostingDate', sql.Date, formData.postingDate || null)
            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
            
            .output('ID', sql.NVarChar(100)) 
            .execute('FinJournalEntry_SaveOrUpdate');

            const newID = result.output.ID;
            if(formData.journalEntryItems){ 
                await journalEntryItemSaveUpdate(req,newID,transaction)
            }

            await transaction.commit();


            res.status(200).json({
                message: 'journalEntry saved/updated',
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
// end of journalEntrySaveUpdate
 
async function journalEntryItemSaveUpdate(req,journalEntryId,transaction){
    const formData = req.body; 
    const journalEntryItems = JSON.parse(formData.journalEntryItems); 
    try {
             
            try { 
                if (journalEntryItems) {
                    for (let item of journalEntryItems) {  
                        console.log('item');
                        console.log(item);

                        if(item.description){ 
                            const itemRequest = new sql.Request(transaction);
                            
                            await itemRequest
                            .input('ID2', sql.NVarChar(65), item.ID2 || '0')  // Use '0' for insert
                            .input('JournalEntryId', sql.NVarChar(65), journalEntryId)
                            .input('Account', sql.NVarChar(100), item.account || null)
                            .input('Description', sql.NVarChar(255), item.description || null)
                            .input('Contact', sql.NVarChar(65), item.contact || null)
                            .input('Debits', sql.NVarChar(100), String(item.debits) || '0.00')
                            .input('Credits', sql.NVarChar(100), String(item.credits) || '0.00')
                            .input('Remarks', sql.NVarChar(sql.MAX), item.remarks || null)
                            .input('currency', sql.NVarChar(65), item.currency || null)
                            .input('fxRate', sql.NVarChar(65), String(item.fxRate) || null)
                            .input('baseCurrencyDebits', sql.NVarChar(100), String(item.baseCurrencyDebits) || '0.00')
                            .input('baseCurrencyCredits', sql.NVarChar(100), String(item.baseCurrencyCredits) || '0.00')
                            .input('taxRate', sql.NVarChar(100), String(item.taxRate) || '0.00')
                            .input('vatId', sql.NVarChar(100), item.vatId || null) 
                            .input('taxRateName', sql.NVarChar(100), item.taxRateName || null)
                            .input('project', sql.NVarChar(65), item.project || null)
                            .input('branchId', sql.NVarChar(65), item.branch || null)
                            .input('costCenter', sql.NVarChar(65), item.costCenter || null)
                            .input('corporateTax', sql.NVarChar(65), item.corporateTax || null) 
                            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
                            
                            .execute('FinJournalEntryLine_SaveOrUpdate');
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
// end of journalEntryItemSaveUpdate

 
 
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
 
const getJournalEntryDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        await setTenantContext(pool,req);
 
        query = `exec FinJournalEntry_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);

        const itemsQuery = `exec FinJournalEntryLine_Get '${Id}'`;
        const itemsApiResponse = await pool.request().query(itemsQuery);

        const data = {
            journalEntryDetails: apiResponse.recordset[0],
            journalEntryItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `JournalEntry details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getJournalEntryDetails

const getJournalEntryItems = async (req, res) => {  
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
            message: `JournalEntry details loaded successfully!`,
            data: itemsApiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getJournalEntryItems
 

const getJournalEntrysList = async (req, res) => {  
    const {organizationId,Id,IsForPO} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec FinJournalEntry_Get Null,'${organizationId}'`;  
        
        // query = `ALTER TABLE FinJournalEntryLine
        //     ALTER COLUMN isDeleted BIT NULL;
        //     `; 
        // query = `
        //     DECLARE @TableName NVARCHAR(MAX);
        //     DECLARE @Sql NVARCHAR(MAX);

        //     DECLARE TableCursor CURSOR FOR
        //     SELECT t.name AS TableName
        //     FROM sys.tables t
        //     JOIN sys.columns c ON t.object_id = c.object_id
        //     WHERE c.name = 'isDeleted'
        //         AND c.system_type_id = 104;  -- 104 = BIT type

        //     OPEN TableCursor;
        //     FETCH NEXT FROM TableCursor INTO @TableName;

        //     WHILE @@FETCH_STATUS = 0
        //     BEGIN
        //         SET @Sql = '
        //             UPDATE [' + @TableName + ']
        //             SET isDeleted = 0
        //             WHERE isDeleted IS NULL;
        //         ';
                
        //         EXEC sp_executesql @Sql;

        //         FETCH NEXT FROM TableCursor INTO @TableName;
        //     END

        //     CLOSE TableCursor;
        //     DEALLOCATE TableCursor;
        //     `;

        const apiResponse = await pool.request().query(query);  

        
        res.status(200).json({
            message: `JournalEntrys List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getJournalEntrysList

const getJournalLedgers = async (req, res) => {  
    const {organizationId,journalEntryId,source,account,startDate,endDate,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        await setTenantContext(pool,req);
         
        const response = await pool
        .request()
        .input("ID2", sql.NVarChar(65), Id || null)
        .input("JournalEntryId", sql.NVarChar(65), journalEntryId || null)
        .input("Source", sql.NVarChar(100), source || null)
        .input("OrganizationId", sql.NVarChar(100), organizationId || null)
        .input("Account", sql.NVarChar(100), account || null)
        .input("StartDate", sql.Date, startDate || null)
        .input("EndDate", sql.Date, endDate || null)
        .execute("FinJournalLedger_Get");
         
        
        res.status(200).json({
            message: `Journal Ledger loaded successfully!`,
            data:  response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getJournalLedgers

const getTrailBalance = async (req, res) => {  
    const {organizationId,fromDate,toDate,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        await setTenantContext(pool,req);
         
        query = `exec GetTrialBalance '${fromDate}','${toDate}','${organizationId}'`;   
          
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Journal Ledger loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getTrailBalance

const getProfitAndLoss = async (req, res) => {  
    const {organizationId,fromYear,fromMonth,toYear,toMonth,groupByYear,groupByOrganization,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        await setTenantContext(pool,req);
         
        const request = pool.request();

        request.input("FromYear", sql.Int, fromYear ?? null);
        request.input("FromMonth", sql.Int, fromMonth ?? null);
        request.input("ToYear", sql.Int, toYear ?? null);
        request.input("ToMonth", sql.Int, toMonth ?? null);
        request.input("OrganizationId", sql.NVarChar(65), organizationId ?? null);
        request.input("GroupByYear", sql.Bit, groupByYear ? 1 : 0);

        const result = await request.execute("GetProfitAndLoss");

        
        res.status(200).json({
            message: `Profit & Loss loaded successfully!`,
            data:  result.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getProfitAndLoss

const getBalanceSheet = async (req, res) => {  
    const {organizationId,fromYear,asOnDate} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        await setTenantContext(pool,req);
         
        query = `exec GetBalanceSheet
        '${asOnDate}',  
        '${organizationId}'`;   
          
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Profit & Loss loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getBalanceSheet



const getCustomerInvoiceAging = async (req, res) => {  
    const {organizationId,type,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        await setTenantContext(pool,req);

        let query = '';
        if (Id) {
            if (type=='customer') {
                query = `exec sp_GetCustomerInvoiceAging '${Id}','${organizationId}'`; 
            }else{
                query = `exec sp_GetSupplierInvoiceAging '${Id}','${organizationId}'`;   
            }

        }else{
            if (type=='customer') {
                query = `exec GetCustomerInvoiceAgingSummary '${organizationId}'`;   
            }else{
                query = `exec GetVendorInvoiceAgingSummary '${organizationId}'`;   
            }

            
        } 
          
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Invoice Aging loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCustomerInvoiceAging


const getVatReturnsDetails = async (req, res) => {  
    const {organizationId,fromDate,toDate,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        await setTenantContext(pool,req);

         const results = await pool
                .request()
                .input("VatEntryID", sql.NVarChar, Id)
                .input("OrganizationID", sql.NVarChar, organizationId)
                .execute("VATReturn_Generate");
         
        
        res.status(200).json({
            message: `Vat Return loaded successfully!`,
            data:  results.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getVatReturnsDetails

const getBankTransections = async (req, res) => {  
    const {organizationId,fromDate,toDate,Id} = req.body;  
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        await setTenantContext(pool,req);

        let query = '';
         if (Id) {
             query = `exec BankTransactions_GetById '${Id}','${organizationId}'`;   
            
         }else{
             query = `exec BankTransactions_GetById NULL,'${organizationId}'`;   

         }
          
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Vat Return loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getBankTransections


const vatSettingsSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
            
            await setTenantContext(pool,req);
              
            const result = await pool.request()
            .input('ID2', sql.NVarChar(65), formData.ID2 || null)
            .input('OrganizationId', sql.NVarChar(65), formData.organizationId)
            .input('TRN', sql.NVarChar(30), formData.trn)
            .input('VatRegisteredOn', sql.Date, formData.vatRegisteredOn)
            .input('FirstTaxReturnFrom', sql.Date, formData.firstTaxReturnFrom)
            .input('InternationalTrade', sql.Bit, formData.internationalTrade ? 1 : 0)
            .input('ReportingPeriod', sql.NVarChar(20), formData.reportingPeriod)
            .input('CreatedBy', sql.NVarChar(100), req.authUser.username)
            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
            
            .execute('VATReturnSettings_SaveOrUpdate');
 

            res.status(200).json({
                message: 'Vat Settings saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of vatSettingsSaveUpdate
 
const getVatSettingsDetails = async (req, res) => {  
    const {Id,organizationId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        await setTenantContext(pool,req);
 
        // query = `exec VATReturnSettings_Get '${Id}','${organizationId}'`;   
        query = `exec VATReturnSettings_Get NULL,'${organizationId}'`;   

        const apiResponse = await pool.request().query(query);
 
        const data = {
            vatSettingDetails: apiResponse.recordset.length > 0 ? apiResponse.recordset[0] : null,
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Vat Settings details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getVatSettingsDetails
 
const getVatReturns = async (req, res) => {
    const {organizationId} = req.body;

    try {
        
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        
        await setTenantContext(pool,req);

         
        const results = await pool
                .request()
                .input("OrganizationID", sql.NVarChar, organizationId)
                .execute("VATReturnEntrySummary_AllPeriods");
            
        return res.status(200).json({
            message: "Vat Returns Data",
            data: results.recordset, 
        });

    } catch (error) {
        console.error("sendOTP Error:", error.message);
        return res.status(500).json({
            message: "Failed to send OTP",
            error: error.message
        });
    }
};



module.exports =  {getVatSettingsDetails,vatSettingsSaveUpdate,getBankTransections,getVatReturns,getVatReturnsDetails,getTrailBalance,getCustomerInvoiceAging,getProfitAndLoss,getBalanceSheet,getJournalLedgers,journalEntrySaveUpdate,getJournalEntrysList,getJournalEntryDetails,getJournalEntryItems} ;
