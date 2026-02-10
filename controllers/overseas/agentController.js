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

  
const agentSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
            await setTenantContext(pool,req);
              
            await pool.request()
            .input("ID2", sql.NVarChar(65), formData.ID2)
            .input("AgentName", sql.NVarChar(255), formData.agentName)
            .input("AgentCode", sql.NVarChar(100), formData.agentCode)
            .input("ContactNumber", sql.NVarChar(50), formData.contactNumber)
            .input("Email", sql.NVarChar(255), formData.email)
            .input("Address", sql.NVarChar(sql.MAX), formData.address)
            .input("City", sql.NVarChar(100), formData.city)
            .input("Country", sql.NVarChar(100), formData.country)
            .input(
                "StatusId",
                sql.Int,
                formData.statusId === 'null' ? null : formData.statusId
            )
            .input("CreatedBy", sql.NVarChar(100), req.authUser.username)
            .input("OrganizationId", sql.NVarChar(65), formData.organizationId || null)
            .input("BranchId", sql.NVarChar(65), formData.branchId || null)
            .input("TenantId", sql.NVarChar(100), req.authUser.tenantId)
            .execute("dbo.Agent_SaveUpdate");


    

            res.status(200).json({
                message: 'agent saved/updated',
                data: '' //result
            });
           
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of agentSaveUpdate
 

 
 
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
 
const getAgentDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);

        const apiResponse = await pool.request()
        .input("ID2", sql.NVarChar(65), Id)
        .input("TenantId", sql.NVarChar(100), req.authUser.tenantId)
        .execute("dbo.Agent_Get");
          
        res.status(200).json({
            message: `Agent details loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAgentDetails
 

const getAllAgentsList = async (req, res) => {  
    const {date,organizationId} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
         
        await setTenantContext(pool,req);
         
         
        const apiResponse = await pool.request()
        .input("OrganizationId", sql.NVarChar(65), organizationId || null) 
        .input("TenantId", sql.NVarChar(100), req.authUser.tenantId)
        .execute("dbo.Agent_Get");

        res.status(200).json({
            message: `Agents List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAllAgentsList

 


module.exports =  {agentSaveUpdate,getAllAgentsList,getAgentDetails} ;
