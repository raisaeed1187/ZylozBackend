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

  
const expenseSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
            
            if (parseBoolean(formData.isBulkExpense)) {
                if(formData.expenseItems){ 
                    var newID = 0;
                    expenseItemSaveUpdate(req,newID)
                }
            }else{
                const result = await pool.request()
                .input('ID2', sql.NVarChar(65), formData.ID2 || '0')
                .input('expenseCode', sql.NVarChar(100), formData.expenseCode || null)
                .input('vendorId', sql.NVarChar(65), formData.vendorId || null)
                .input('expenseAccount', sql.NVarChar(100), formData.expenseAccount || null)
                .input('branchId', sql.NVarChar(65), formData.branchId || null)
                .input('expenseDate', sql.NVarChar(100), formData.expenseDate || new Date())
                .input('expenseAmount', sql.Decimal(18, 2), formData.expenseAmount || 0.00)
                .input('paymentMode', sql.NVarChar(65), formData.paymentMode || null)
                .input('paymentThrough', sql.NVarChar(100), formData.paymentThrough || null)
                .input('project', sql.NVarChar(100), formData.project || null)
                .input('customerId', sql.NVarChar(65), formData.customerId || null)
                .input('referenceNo', sql.NVarChar(100), formData.referenceNo || null)
                .input('remarks', sql.NVarChar(sql.MAX), formData.remarks || null)
                .input('statusId', sql.Int, formData.statusId || 1)
                .input('isBulkExpense', sql.Bit, parseBoolean(formData.isBulkExpense) || false)
                .input('billable', sql.Bit, parseBoolean(formData.billable) || false)
                .input('organizationId', sql.NVarChar(65), formData.organizationId || null)
                .input('currency', sql.NVarChar(10), formData.currency || 'AED')
                .input('createdBy', sql.NVarChar(100), formData.createdBy || null) 
                .output('ID', sql.NVarChar(100))
                .execute('FinExpenses_SaveOrUpdate'); 
                const newID = result.output.ID;

            }
             
            

            res.status(200).json({
                message: 'vendor expense saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

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

async function expenseItemSaveUpdate(req,expenseId){
    const formData = req.body; 
    const expenseItems = JSON.parse(formData.expenseItems); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (expenseItems) {
                    for (let item of expenseItems) {  
                        if(item.expenseAccount){ 
                            await pool.request()
                                .input('ID2', sql.NVarChar(65), item.ID2 || '0')
                                .input('expenseCode', sql.NVarChar(100), item.expenseCode || null)
                                .input('vendorId', sql.NVarChar(65), item.vendorId || null)
                                .input('expenseAccount', sql.NVarChar(100), item.expenseAccount || null)
                                .input('branchId', sql.NVarChar(65), item.branchId || null)
                                .input('expenseDate', sql.NVarChar(100), item.expenseDate || new Date())
                                .input('expenseAmount', sql.Decimal(18, 2), item.expenseAmount || 0.00)
                                .input('paymentMode', sql.NVarChar(65), item.paymentMode || null)
                                .input('paymentThrough', sql.NVarChar(100), item.paymentThrough || null)
                                .input('project', sql.NVarChar(100), item.project || null)
                                .input('customerId', sql.NVarChar(65), item.customerId || null)
                                .input('referenceNo', sql.NVarChar(100), item.referenceNo || null)
                                .input('remarks', sql.NVarChar(sql.MAX), item.remarks || null)
                                .input('statusId', sql.Int, item.statusId || 1)
                                .input('isBulkExpense', sql.Bit, parseBoolean( item.isBulkExpense) || false)
                                .input('billable', sql.Bit, item.billable || false)
                                .input('organizationId', sql.NVarChar(65), formData.organizationId || null)
                                .input('currency', sql.NVarChar(10), item.currency || 'AED')
                                .input('createdBy', sql.NVarChar(100), formData.createdBy || null) 
                                .output('ID', sql.NVarChar(100))
                                .execute('FinExpenses_SaveOrUpdate'); 

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
// end of expenseItemSaveUpdate
 
 
 
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
 
const getExpenseDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
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
    const {organizationId,Id,IsForPO} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec FinExpenses_Get Null,'${organizationId}'`;   
          
         
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
 
 


module.exports =  {expenseSaveUpdate,getExpensesList,getExpenseDetails} ;
