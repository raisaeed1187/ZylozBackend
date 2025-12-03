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

  
const costCenterSaveUpdate = async (req,res)=>{
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
                .input('ID2', sql.NVarChar(65), formData.ID2 || '0')
                .input('CostCenterCode', sql.NVarChar(50), formData.costCenterCode || null)
                .input('CostCenterName', sql.NVarChar(150), formData.costCenterName || null)
                .input('Description', sql.NVarChar(sql.MAX), formData.description || null)
                .input('Type', sql.NVarChar(50), formData.type || null)
                .input('TypeId', sql.NVarChar(66), formData.typeId || null) 
                .input('DepartmentId', sql.NVarChar(65), formData.departmentId || null)
                .input('StaffId', sql.NVarChar(65), formData.staffId || null) 
                .input('StatusId', sql.Int, formData.statusId || null)
                .input('OrganizationId', sql.NVarChar(65), formData.organizationId || null)
                .input('CreatedBy', sql.NVarChar(100), req.authUser.username || null)
                .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )   
                .execute('CostCenter_SaveOrUpdate');
  
 

            res.status(200).json({
                message: 'costCenter saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of costCenterSaveUpdate

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
const getCostCenterDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        await setTenantContext(pool,req);
 
        query = `exec CostCenter_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);
 
        const data = {
            costCenterDetails: apiResponse.recordset[0],
            // costCenterItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `CostCenter details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCostCenterDetails
 

const getCostCentersList = async (req, res) => {  
    const {organizationId,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        await setTenantContext(pool,req);
         
        query = `exec CostCenter_Get Null,'${organizationId}'`;   
           

        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `CostCenters List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCostCentersList
 


const costCenterTypeSaveUpdate = async (req,res)=>{
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
            .input('ID2', sql.NVarChar(65), formData.ID2 || '0') 
            .input('costCenterType', sql.NVarChar(255), formData.costCenterType || null)  
            .input('organizationId', sql.NVarChar(65), formData.organizationId || null) 
            .input('createdBy', sql.NVarChar(100), req.authUser.username || null)  
            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
            
            .execute('CostCenterType_SaveOrUpdate');   

            res.status(200).json({
                message: 'costCenterType saved/updated',
                data: '' //result
            });

        } catch (error) {
            return res.status(400).json({ message: error.message,data:null});

        }
}
// end of costCenterTypeSaveUpdate

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
const getCostCenterTypeDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
 
        query = `exec CostCenterType_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);
 
        const data = {
            costCenterTypeDetails: apiResponse.recordset[0],
            // costCenterTypeItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `CostCenterType details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCostCenterTypeDetails
 

const getCostCenterTypesList = async (req, res) => {  
    const {organizationId,Id,IsForPO} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
         
        query = `exec CostCenterType_Get Null,'${organizationId}'`;   
          
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `CostCenterTypes List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCostCenterTypesList
 
 
 


module.exports =  {costCenterTypeSaveUpdate,getCostCenterTypeDetails,getCostCenterTypesList,costCenterSaveUpdate,getCostCentersList,getCostCenterDetails} ;
