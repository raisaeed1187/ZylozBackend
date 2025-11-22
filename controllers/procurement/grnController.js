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

  
const grnSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    
    let pool;
    let transaction;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            pool = await sql.connect(config);
            transaction = new sql.Transaction(pool);

            await transaction.begin();

            const request = new sql.Request(transaction);
            

            const result = await request
            .input('ID2', sql.NVarChar(65), formData.ID2)
            .input('grnCode', sql.NVarChar(50), formData.grnCode)
            .input('poID', sql.NVarChar(65), formData.poID)
            .input('vendorName', sql.NVarChar(100), formData.vendorName)
            .input('deliveryNoteNo', sql.NVarChar(100), formData.deliveryNoteNo)
            .input('grnDate', sql.NVarChar(100), formData.grnDate)
            .input('receivedBy', sql.NVarChar(100), formData.receivedBy)
            .input('warehouseLocation', sql.NVarChar(100), formData.warehouseLocation)
            .input('remarks', sql.NVarChar(sql.MAX), formData.remarks)
            .input('statusId', sql.Int, formData.statusId || 1)
            .input('totalItems', sql.Int, formData.totalItems || 0)
            .input('totalAmount', sql.Decimal(18, 8), formData.totalAmount || 0)
            .input('createdBy', sql.NVarChar(100), formData.createdBy)
            .output('ID', sql.NVarChar(100))
            .execute('GRN_SaveUpdate');

            const newID = result.output.ID;
            if(formData.grnItems){ 
                await grnItemSaveUpdate(req,newID,transaction)
            }

            await transaction.commit();
            console.log("Transaction COMMITTED!");


            res.status(200).json({
                message: 'grn saved/updated',
                data: '' //result
            });

        } catch (error) {
            console.error("GRN SAVE ERROR:", error);

            if (transaction) {
                try {
                    await transaction.rollback();
                    console.log("Transaction ROLLED BACK!");
                } catch (rollbackErr) {
                    console.error("Rollback failed:", rollbackErr);
                }
            }
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of grnSaveUpdate
 
async function grnItemSaveUpdate(req,grnId,transaction){
    const formData = req.body; 
    const grnItems = JSON.parse(formData.grnItems); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            // const pool = await sql.connect(config);
            
            try { 
                if (grnItems) {
                    for (let item of grnItems) {  
                        if(item.itemName){
                            const grnItemRequest = new sql.Request(transaction);  

                            await grnItemRequest 
                                .input('ID2', sql.NVarChar(65), item.ID2)
                                .input('grnId', sql.NVarChar(65), grnId)
                                .input('poId', sql.NVarChar(65), item.poId) 
                                .input('itemId', sql.NVarChar(65), item.itemId)
                                .input('itemCode', sql.NVarChar(100), item.itemCode || null)
                                .input('itemName', sql.NVarChar(200), item.itemName)
                                .input('itemType', sql.NVarChar(100), item.itemType || null)
                                .input('itemUnit', sql.NVarChar(50), item.itemUnit)
                                .input('orderQty', sql.NVarChar(100), String(item.orderQty))
                                .input('receivedQty', sql.NVarChar(100), String(item.receivedQty))
                                .input('balancedQty', sql.NVarChar(100), String(item.balancedQty))
                                .input('currentReceivingQty', sql.NVarChar(100), String(item.currentReceivingQty))
                                .input('remarks', sql.NVarChar(sql.MAX), item.remarks) 
                                .input('statusId', sql.Int, formData.statusId || 1) 
                                .execute('GRNItem_SaveOrUpdate');
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
// end of grnItemSaveUpdate

 
 
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
 
const getGRNDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        query = `exec GRN_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);

        const itemsQuery = `exec GRNItem_Get '${Id}'`;
        const itemsApiResponse = await pool.request().query(itemsQuery);

        const data = {
            grnDetails: apiResponse.recordset[0],
            grnItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `GRN details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getGRNDetails

const getGRNItems = async (req, res) => {  
    const {Id,poId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        if (poId) {
            query = `exec GRNItem_Get null,null,'${poId}'`; 
        }else{
            query = `exec GRNItem_Get '${Id}',1`; 
        }  
        console.log('query');
        console.log(query);

        const itemsApiResponse = await pool.request().query(query); 
          
        res.status(200).json({
            message: `GRN details loaded successfully!`,
            data: itemsApiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getGRNItems
 

const getGRNsList = async (req, res) => {  
    const {Id,IsForPO} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        if (IsForPO){
            query = `exec PurchaseRequest_Get Null, ${IsForPO}`;   
        } else{
            query = `exec GRN_Get`;   
        }
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `GRNs List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getGRNsList

const getPOPreviousGRns = async (req, res) => {  
    const {poID,IsForPO} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = ''; 
        query = `exec PO_Previous_GRNs_Get  ${poID}`;   
          
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Previous GRNs List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPOPreviousGRns
 




module.exports =  {grnSaveUpdate,getPOPreviousGRns,getGRNsList,getGRNDetails,getGRNItems} ;
