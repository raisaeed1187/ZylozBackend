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

  
const supplierBillSaveUpdate = async (req,res)=>{
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
            .input('SupplierBillCode', sql.NVarChar(50), formData.supplierBillCode || null)
            .input('BillNo', sql.NVarChar(50), formData.billNo || null)
            .input('OrderNo', sql.NVarChar(65), formData.orderNo || null)
            .input('VendorId', sql.NVarChar(65), formData.vendorId || null)
            .input('BranchId', sql.NVarChar(65), formData.branchId || null)
            .input('Currency', sql.NVarChar(10), formData.currency || 'AED')
            .input('Notes', sql.NVarChar(sql.MAX), formData.notes || null)
            .input('SupplierBillDate', sql.NVarChar(100), formData.supplierBillDate || null)
            .input('DueDate', sql.NVarChar(100), formData.dueDate || null)
            .input('PaymentTerm', sql.NVarChar(65), formData.paymentTerm || null)
            .input('InvoiceAmount', sql.Decimal(18, 2), formData.invoiceAmount || 0.00)
            .input('StatusId', sql.Int, formData.statusId || 1)
            .input('TotalItems', sql.Int, formData.totalItems || 0)
            .input('TotalAmount', sql.Decimal(18, 2), formData.totalAmount || 0.00)
            .input('OrganizationId', sql.NVarChar(65), formData.organizationId)
            .input('CreatedBy', sql.NVarChar(100), formData.createdBy)
            .input('IsForPO', sql.Bit, formData.isForPO == 'true' ? 1 : 0)
            .output('ID', sql.NVarChar(100))  
            .execute('SupplierBill_SaveOrUpdate');

            const newID = result.output.ID;
            if(formData.supplierBillItems){ 
                supplierBillItemSaveUpdate(req,newID)
            }

            res.status(200).json({
                message: 'supplierBill saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of supplierBillSaveUpdate
 
async function supplierBillItemSaveUpdate(req,supplierBillId){
    const formData = req.body; 
    const supplierBillItems = JSON.parse(formData.supplierBillItems); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (supplierBillItems) {
                    for (let item of supplierBillItems) {  
                        if(item.description){ 
                            console.log('item :',item);
                           await pool.request()
                            .input('ID2', sql.NVarChar(65), item.ID2 || null)           // ID2 nullable
                            .input('supplierBillId', sql.NVarChar(65), supplierBillId || null) // supplierBillId param
                            .input('grnId', sql.NVarChar(100), item.grnId || null)
                            .input('itemId', sql.NVarChar(100), item.itemId || null)
                            .input('account', sql.NVarChar(100), item.account || null)
                            .input('description', sql.NVarChar(255), item.description || null)
                            .input('currency', sql.NVarChar(10), item.currency || null)
                            .input('qty', sql.Int, item.qty != null ? item.qty : 1)
                            .input('price', sql.Decimal(18,4), item.price != null ? item.price : 0)
                            .input('taxRate', sql.Decimal(5,2), item.taxRate != null ? item.taxRate : 0)
                            .input('taxRateName', sql.NVarChar(100), item.taxRateName || null)
                            .input('customerId', sql.NVarChar(65), item.customerId || null)
                            .input('corporateTax', sql.NVarChar(50), item.corporateTax || null)
                            .input('remarks', sql.NVarChar(255), item.remarks || null)
                            .input('createdBy', sql.NVarChar(100), formData.createdBy || 'system')
                            .execute('FinSupplierBillItem_SaveOrUpdate');
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
// end of supplierBillItemSaveUpdate

 
 
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
 
const getSupplierBillDetails = async (req, res) => {  
    const {Id,organizationId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        query = `exec finSupplierBillGet '${Id}','${organizationId}'`;   
        const apiResponse = await pool.request().query(query);

        const itemsQuery = `exec finSupplierBillItemGet Null,'${Id}'`;
        const itemsApiResponse = await pool.request().query(itemsQuery);

        const data = {
            supplierBillDetails: apiResponse.recordset[0],
            supplierBillItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `SupplierBill details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getSupplierBillDetails

const getSupplierBillItems = async (req, res) => {  
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
            message: `SupplierBill details loaded successfully!`,
            data: itemsApiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getSupplierBillItems
 

const getSupplierBillsList = async (req, res) => {  
    const {organizationId,Id,vendorId} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        
        if (vendorId) {
            query = `exec finSupplierBillGet Null,'${organizationId}','${vendorId}'`;   
        }else{
            query = `exec finSupplierBillGet Null,'${organizationId}'`;   

        }  
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `SupplierBills List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getSupplierBillsList

 
 


module.exports =  {supplierBillSaveUpdate,getSupplierBillsList,getSupplierBillDetails,getSupplierBillItems} ;
