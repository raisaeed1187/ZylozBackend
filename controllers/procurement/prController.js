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

  
const prSaveUpdate = async (req,res)=>{
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
            .input('PrType', sql.NVarChar(100), formData.prType)
            .input('PrCode', sql.NVarChar(100), formData.prCode)
            .input('PrName', sql.NVarChar(200), formData.prName)
            .input('Classification', sql.NVarChar(100), formData.classification) 
            .input('Department', sql.NVarChar(100), formData.department)
            .input('Contract', sql.NVarChar(100), formData.contract)
            .input('DeliveryDate', sql.NVarChar(100), formData.deliveryDate)
            .input('DeliveryLocation', sql.NVarChar(200), formData.deliveryLocation)
            .input('Description', sql.NVarChar(sql.MAX), formData.description)
            .input('StatusId', sql.Int, formData.statusId || 1)
            .input('TotalItems', sql.NVarChar(100), formData.totalItems)
            .input('TotalAmount', sql.NVarChar(100), formData.totalAmount) 
            .input('CreatedBy', sql.NVarChar(100), formData.createdBy)
            .input('OrganizationId', sql.NVarChar(100), formData.organizationId)
            .output('ID', sql.NVarChar(100))
            .execute('PurchaseRequest_SaveOrUpdate');

            const newID = result.output.ID;
            if(formData.prItems){ 
                prItemSaveUpdate(req,newID)
            }

            res.status(200).json({
                message: 'pr saved/updated',
                data: '' //result
            });
           
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of prSaveUpdate
 
async function prItemSaveUpdate(req,prId){
    const formData = req.body; 
    const prItems = JSON.parse(formData.prItems); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (prItems) {
                    for (let item of prItems) {  
                        if(item.itemType){
                            await pool.request()
                                .input('ID2', sql.NVarChar(65), item.ID2)
                                .input('ItemId', sql.NVarChar(65), item.itemId)
                                .input('PrId', sql.NVarChar(65), prId)
                                .input('ItemCode', sql.NVarChar(100), item.itemCode)
                                .input('ItemName', sql.NVarChar(200), item.itemName)
                                .input('ItemType', sql.NVarChar(100), item.itemType)
                                .input('ItemUnit', sql.NVarChar(50), item.itemUnit)
                                .input('Qty', sql.NVarChar(100), String(item.qty))
                                .input('UnitCost', sql.NVarChar(100), String(item.unitCost))
                                .input('Total', sql.NVarChar(100), String(item.total))
                                .input('DeliveryLocation', sql.NVarChar(500), item.deliveryLocation)
                                .input('DeliveryDate', sql.NVarChar(100), item.deliveryDate)

                                .execute('PurchaseItem_SaveOrUpdate');
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
// end of prItemSaveUpdate

 
 
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
 
const getPRDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        query = `exec PurchaseRequest_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query); 
         
        const itemsQuery = `exec PurchaseItem_Get '${Id}'`;   
        const itemsApiResponse = await pool.request().query(itemsQuery); 
         

        const data = {
            prDetails: apiResponse.recordset[0],
            prItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `PR details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPRDetails

const getPRItems = async (req, res) => {  
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
            message: `PR details loaded successfully!`,
            data: itemsApiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPRItems
 

const getPRsList = async (req, res) => {  
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
            query = `exec PurchaseRequest_Get`;   
        }
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `PRs List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPRsList

 


module.exports =  {prSaveUpdate,getPRsList,getPRDetails,getPRItems} ;
