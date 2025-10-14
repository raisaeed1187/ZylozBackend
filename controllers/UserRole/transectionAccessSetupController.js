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

  
const transactionAccessSaveOrUpdate = async (req, res) => {
  const formData = req.body;

  try {
    // Set DB connection & user context
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    console.log("formData:", formData);

    const pool = await sql.connect(config);

    const mainPermissions = JSON.parse(formData.mainPermissions); 

    console.log('mainPermissions');
    console.log(mainPermissions);

    const result = await pool
      .request()
      .input("ID2", sql.NVarChar(65), formData.ID2 || null)
      .input("TransactionId", sql.NVarChar(65), formData.transactionId || null)
      .input("TransactionName", sql.NVarChar(100), formData.transactionName || null)
      .input("OrganizationId", sql.NVarChar(65), formData.organizationId || null)
      .input("FullAccess", sql.Bit, parseBoolean(mainPermissions.fullAccess) ?? false)
      .input("View", sql.Bit, parseBoolean(mainPermissions.view) ?? false)
      .input("Add", sql.Bit, parseBoolean(mainPermissions.add) ?? false)
      .input("Edit", sql.Bit, parseBoolean(mainPermissions.edit) ?? false)
      .input("Delete", sql.Bit, parseBoolean(mainPermissions.delete) ?? false)
      .input("Export", sql.Bit, parseBoolean(mainPermissions.export) ?? false)
      .input("Print", sql.Bit, parseBoolean(mainPermissions.print) ?? false)
      .input("CreatedBy", sql.NVarChar(100), formData.createdBy || req.authUser?.userName || "System")
      .output("ID", sql.NVarChar(100)) // OUTPUT parameter
      .execute("TransactionAccess_SaveOrUpdate");

    const newID = result.output.ID;

    if(formData.extraPermissions){ 
        transectionExtraPermissionSaveUpdate(req,newID)
    }

    res.status(200).json({
      message: "Transaction Access saved/updated successfully",
      id: newID,
    });
  } catch (error) {
    console.error("Error saving TransactionAccess:", error);
    res.status(400).json({
      message: error.message,
      data: null,
    });
  }
};

async function transectionExtraPermissionSaveUpdate(req,transectionId){
    const formData = req.body; 
    const extraPermissions = JSON.parse(formData.extraPermissions); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (extraPermissions) {
                    for (let item of extraPermissions) {  
                        console.log(item);
                        if(item.PermissionName){  

                            const result = await pool.request()
                            .input('ID2', sql.NVarChar(65), item.ID2 || null)
                            .input('TransactionAccessId', sql.NVarChar(65), transectionId || null)
                            .input('PermissionCode', sql.NVarChar(100), item.PermissionCode)
                            .input('PermissionName', sql.NVarChar(250), item.PermissionName || null) 
                            .input('IsActive', sql.Bit, parseBoolean(item.IsActive) || false ) 
                            .execute('TransactionExtraPermissions_SaveOrUpdate');
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
// end of invoiceItemSaveUpdate

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
const getTransectionAccessDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        query = `exec TransactionAccess_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query);

        let extraPermissionQuery = `exec TransactionExtraPermissions_Get NULL,'${Id}'`;   
        const extraPermissionApiResponse = await pool.request().query(extraPermissionQuery);
        
        const transectionAccessDetails =  apiResponse.recordset[0];

        const mainPermissions = {
            fullAccess: transectionAccessDetails.fullAccess,
            view: transectionAccessDetails.view,
            add: transectionAccessDetails.add,
            edit: transectionAccessDetails.edit,
            delete: transectionAccessDetails.delete,
            export: transectionAccessDetails.export,
            print: transectionAccessDetails.print,
        }
        
        const data = {
            transectionAccessDetails: transectionAccessDetails,
            mainPermissions: mainPermissions, 
            extraPermissions: extraPermissionApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `TransectionAccess details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getTransectionAccessDetails
 
const getAllTransectionAccessWithPermissions = async (req, res) => {  
    try {

        // 🔧 Setup configuration
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);

        // 🧩 Step 1: Get all transaction access records
        const transectionAccessResult = await pool.request().query(`EXEC TransactionAccessForRole_Get`);

        // 🧩 Step 2: Get all extra permissions
        const extraPermissionsResult = await pool.request().query(`EXEC TransactionExtraPermissionsForRole_Get`);

        const transectionAccessList = transectionAccessResult.recordset || [];
        const extraPermissionsList = extraPermissionsResult.recordset || [];

        // 🧠 Step 3: Group extra permissions by TransactionAccessId
        const groupedPermissions = extraPermissionsList.reduce((acc, perm) => {
            if (!acc[perm.TransactionAccessId]) acc[perm.TransactionAccessId] = [];
            acc[perm.TransactionAccessId].push(perm);
            return acc;
        }, {});

        // 🧱 Step 4: Merge main transaction access with their respective extra permissions
        const combinedData = transectionAccessList.map(access => ({
            ...access,
            extraPermissions: groupedPermissions[access.transactionAccessId] || []
        }));

        // ✅ Return final structured response
        res.status(200).json({
            message: "All Transaction Access with respective permissions loaded successfully!",
            data: combinedData
        });

    } catch (error) {
        console.error("Error fetching Transaction Access with Permissions:", error);
        res.status(400).json({ message: error.message, data: null });
    }
};
// end of getAllTransectionAccessWithPermissions


const getTransectionAccesssList = async (req, res) => {  
    const {organizationId,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec TransactionAccess_Get `;   
          
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `TransectionAccesss List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getTransectionAccesssList
 
 


module.exports =  {transactionAccessSaveOrUpdate,getTransectionAccesssList,getTransectionAccessDetails,getAllTransectionAccessWithPermissions} ;
