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
 
  
const poSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
              
            let result = await pool.request()
            .input('ID2', sql.NVarChar(65), formData.ID2)
            .input('PoType', sql.NVarChar(65), formData.poType)
            .input('PoCode', sql.NVarChar(50), formData.poCode)
            .input('Vendor', sql.NVarChar(200), formData.vendor)
            .input('ContactPerson', sql.NVarChar(100), formData.contactPerson)
            .input('PoDate', sql.Date, formData.poDate)
            .input('PaymentTerm', sql.NVarChar(100), formData.paymentTerm)
            .input('Description', sql.NVarChar(sql.MAX), formData.description)
            .input('StatusId', sql.Int, formData.statusId)
            .input('TotalItems', sql.NVarChar(100), formData.totalItems)
            .input('TotalAmount', sql.NVarChar(100), formData.totalAmount)
            .input('CreatedBy', sql.NVarChar(100), formData.createdBy)
            .output('ID', sql.NVarChar(100))  
            .execute('PurchaseOrder_SaveOrUpdate');

            const newID = result.output.ID;
            if(formData.poItems){ 
                poItemSaveUpdate(req,newID)
            }

            res.status(200).json({
                message: 'po saved/updated',
                data: '' //result
            });
           
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of poSaveUpdate
 
async function poItemSaveUpdate(req,poId){
    const formData = req.body; 
    const poItems = JSON.parse(formData.poItems); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (poItems) {
                    for (let item of poItems) {  
                        if(item.itemType){
                            await pool.request()
                                .input('ID2', sql.NVarChar(65), item.ID2)
                                .input('ItemId', sql.NVarChar(65), item.itemId)
                                .input('PrId', sql.NVarChar(65), item.prId)
                                .input('PoId', sql.NVarChar(65), poId) 
                                .input('ItemCode', sql.NVarChar(100), item.itemCode)
                                .input('ItemName', sql.NVarChar(200), item.itemName)
                                .input('ItemType', sql.NVarChar(100), item.itemType)
                                .input('ItemUnit', sql.NVarChar(50), item.itemUnit)
                                .input('Qty', sql.NVarChar(100), String(item.qty))
                                .input('UnitCost', sql.NVarChar(100), String(item.unitCost))
                                .input('Total', sql.NVarChar(100), String(item.total))
                                .input('DeliveryLocation', sql.NVarChar(500), item.deliveryLocation)
                                .input('DeliveryDate', sql.NVarChar(100), item.deliveryDate)

                                .execute('PurchaseOrderItem_SaveOrUpdate');
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
// end of poItemSaveUpdate

 
 
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
 
const getPODetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        query = `exec PurchaseOrder_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query); 
         
        const itemsQuery = `exec PurchaseOrderItem_Get '${Id}'`;   
        const itemsApiResponse = await pool.request().query(itemsQuery); 
         

        const data = {
            poDetails: apiResponse.recordset[0],
            poItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `PO details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPODetails

const getPOItems = async (req, res) => {  
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
            message: `PO details loaded successfully!`,
            data: itemsApiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPOItems

const deletePOItem = async (req, res) => {  
    const {Id, poId, prId,itemId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        query = `exec PurchaseOrderItem_Delete  '${Id}','${poId}','${prId}','${itemId}'`;   
        const apiResponse = await pool.request().query(query); 
         
           
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `PO item deleted loaded successfully!`,
            data: ''
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of deletePOItem

const getPOsList = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec PurchaseOrder_Get `;   
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `POs List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPOsList

 


module.exports =  {poSaveUpdate,getPOsList,getPODetails,getPOItems,deletePOItem} ;
