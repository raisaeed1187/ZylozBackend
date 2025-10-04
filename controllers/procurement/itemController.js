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

  
const itemSaveUpdate = async (req,res)=>{
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
            .input('itemType', sql.NVarChar(65), formData.itemType)
            .input('itemCode', sql.NVarChar(100), formData.itemCode)
            .input('itemName', sql.NVarChar(255), formData.itemName)
            .input('itemDescription', sql.NVarChar(sql.MAX), formData.itemDescription)
            .input('itemCategory', sql.NVarChar(65), formData.itemCategory)
            .input('itemSubCategory', sql.NVarChar(65), formData.itemSubCategory)
            .input('unitOfMeasurement', sql.NVarChar(65), formData.unitOfMeasurement)
            .input('partNumber', sql.NVarChar(100), formData.partNumber)
            .input('barcode', sql.NVarChar(255), formData.barcode) 
            .input("statusId", sql.Int, formData.statusId === 'null' ? null : formData.statusId || null) 
            .input('sellingPrice', sql.NVarChar(100), formData.sellingPrice || '0')
            .input('costPrice', sql.NVarChar(100), formData.costPrice || '0')
            .input('createdBy', sql.NVarChar(100), formData.createdBy)
            .output('ID', sql.NVarChar(100)) // output param 
            .execute('dbo.MaterialItem_SaveUpdate');

            const newID = result.output.ID; 
            if(formData.itemVariations){ 
                itemVariationSaveUpdate(req,newID)
            }
    

            res.status(200).json({
                message: 'item saved/updated',
                data: '' //result
            });
           
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of itemSaveUpdate
 

async function itemVariationSaveUpdate(req, itemId) {
    const formData = req.body;
    const itemVariations = JSON.parse(formData.itemVariations);  

    try {
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser));
        const config = store.getState().constents.config;

        const pool = await sql.connect(config);

        try {
            for (let item of itemVariations) {
                console.log(item);
                if (item.variationName) {
                    const result = await pool.request()
                        .input('ID2', sql.NVarChar(65), item.ID2 || null)
                        .input('ItemId', sql.NVarChar(65), itemId)
                        .input('VariationName', sql.NVarChar(250), item.variationName)
                        .input('VariationValue', sql.NVarChar(250), item.variationName)
                        .input('AdditionalPrice', sql.Decimal(18, 2), item.price || 0)
                        .input('CreatedBy', sql.NVarChar(100), formData.createdBy || 'system')
                        .execute('ItemVariation_SaveOrUpdate'); 
                }
 
            }

        } catch (err) {
            throw new Error("SQL Error: " + err.message);
        }

    } catch (error) {
        throw new Error("Connection Error: " + error.message);
    }
}

 
 
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
 
const getItemDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        let itemQuery = '';

        if (Id){
            query = `exec MaterialItem_Get '${Id}'`;  
            itemQuery = `exec ItemVariation_Get '${Id}'`;   
        } else{
            query = `exec MaterialItem_Get `;   
        }
         
         
        const apiResponse = await pool.request().query(query); 
        const itemQueryApiResponse = await pool.request().query(itemQuery); 


        const data = {
            itemDetails: apiResponse.recordset[0], 
            itemVariations: itemQueryApiResponse.recordset,  
        }
         
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Item details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getItemDetails
 

const getItemsList = async (req, res) => {  
    const {date,isMonthly,client} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser?.database || client || 'Zyloz'));
        store.dispatch(setCurrentUser(req.authUser || 'System')); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec MaterialItem_GetList `;   
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Items List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getItemsList

const getItemVariationsList = async (req, res) => {  
    const {itemId,client} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser?.database || client || 'Zyloz'));
        store.dispatch(setCurrentUser(req.authUser || 'System')); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec ItemVariation_Get  ${itemId}`;   
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Item Variations List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getItemVariationsList

const getItemsWithVariations = async (req, res) => {  
    const {client} = req.body; // user data sent from client

    try {

        store.dispatch(setCurrentDatabase(req.authUser?.database || client || 'Zyloz'));
        store.dispatch(setCurrentUser(req.authUser || 'System')); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  

        // Fetch all items
        const apiResponse = await pool.request().query(`exec MaterialItem_Get`);
        const allItems = apiResponse.recordset || [];

        let result = [];

        // Loop through each item
        for (const item of allItems) {
            // Fetch variations for this item
            const itemQueryApiResponse = await pool.request()
                .input('itemId', sql.VarChar, item.ID2)
                .query(`exec ItemVariation_Get '${item.ID2}'`);
            
            const itemVariations = itemQueryApiResponse.recordset || [];

            // Transform into desired format
            let transformedItem = {
                itemName: item.itemName || '',
                itemId: item.ID2 || '', 
            };

            itemVariations.forEach((variation, index) => {
                transformedItem[`Variation ${index + 1}`] = `${variation.variationName} - ${variation.price}`;
                transformedItem[`ServiceId ${index + 1}`] = `${variation.ID2}`;
                 
                // transformedItem[`Variation-price ${index + 1}`] = `${variation.price}`;

            });

            result.push(transformedItem);
        }

        // Return all items
        res.status(200).json({
            message: `All item details loaded successfully!`,
            data: result
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
 


module.exports =  {itemSaveUpdate,getItemsList,getItemDetails,getItemVariationsList,getItemsWithVariations} ;
