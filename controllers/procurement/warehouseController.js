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

  
const warehouseSaveUpdate = async (req,res)=>{
    const formData = req.body;  

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
             
            const result = await pool.request()
            .input('ID2', sql.NVarChar(65), formData.ID2 || null) // use null for new warehouse
            .input('WarehouseCode', sql.NVarChar(50), formData.warehouseCode || null)
            .input('WarehouseName', sql.NVarChar(255), formData.warehouseName || null)
            .input('Type', sql.NVarChar(50), formData.type || null)
            .input('Status', sql.NVarChar(50), formData.status || null)
            .input('Description', sql.NVarChar(sql.MAX), formData.description || null)
            .input('StreetAddress', sql.NVarChar(255), formData.streetAddress || null)
            .input('City', sql.NVarChar(100), formData.city || null)
            .input('Emirate', sql.NVarChar(100), formData.emirate || null)
            .input('ContactPerson', sql.NVarChar(100), formData.contactPerson || null)
            .input('Phone', sql.NVarChar(50), formData.phone || null)
            .input('Email', sql.NVarChar(100), formData.email || null)
            .input('TotalArea', sql.Decimal(10,2), formData.totalArea || null)
            .input('StorageCapacity', sql.Decimal(10,2), formData.storageCapacity || null)
            .input('PalletPositions', sql.Int, formData.palletPositions || null)
            .input('LoadingDocks', sql.Int, formData.loadingDocks || null)
            .input('TemperatureControl', sql.NVarChar(50), formData.temperatureControl || null)
            .input('OperatingHoursFrom', sql.NVarChar(50), formData.operatingHoursFrom || null)
            .input('OperatingHoursTo', sql.NVarChar(50), formData.operatingHoursTo || null)
            .input('CreatedBy', sql.NVarChar(100), req.authUser.username || null)
            .input('UpdatedBy', sql.NVarChar(100), req.authUser.username || null)
            .input('OrganizationId', sql.NVarChar(65), formData.organizationId || null)
            .execute('Warehouse_SaveOrUpdate');
  

            res.status(200).json({
                message: 'warehouse saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of warehouseSaveUpdate

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
const getWarehouseDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
           const result = await pool.request()
            .input('ID2', sql.NVarChar(65), Id ||  null)
            .input('WarehouseName', sql.NVarChar(255), null)
            .input('Type', sql.NVarChar(50),  null)
            .input('Status', sql.NVarChar(50), null)
            .input('OrganizationId', sql.NVarChar(65), null)
            .execute('Warehouse_Get');
 
        const data = {
            warehouseDetails: result.recordset[0],
            // warehouseItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Warehouse details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getWarehouseDetails
 

const getWarehousesList = async (req, res) => {  
    const {organizationId,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        const result = await pool.request()
            .input('ID2', sql.NVarChar(65),  null)
            .input('WarehouseName', sql.NVarChar(255), null)
            .input('Type', sql.NVarChar(50),  null)
            .input('Status', sql.NVarChar(50), null)
            .input('OrganizationId', sql.NVarChar(65), organizationId || null)
            .execute('Warehouse_Get');
        
        res.status(200).json({
            message: `Warehouses List loaded successfully!`,
            data:  result.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getWarehousesList
 
 
function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
 
 
 


module.exports =  {warehouseSaveUpdate,getWarehousesList,getWarehouseDetails} ;
