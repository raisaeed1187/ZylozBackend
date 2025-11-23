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

const crmLeadSaveUpdate = async (req, res) => {
    const formData = req.body;

    try { 

        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser));
        const config = store.getState().constents.config;

        console.log('formData:', formData);

        const pool = await sql.connect(config);

        const result = await pool.request()
            .input('ID2', sql.NVarChar(65), formData.ID2 || null)
            .input('LeadName', sql.NVarChar(255), formData.leadName || null)
            .input('LeadCode', sql.NVarChar(50), formData.leadCode || null)
            .input('JobTitle', sql.NVarChar(255), formData.jobTitle || null)
            .input('CompanyName', sql.NVarChar(255), formData.companyName || null)
            .input('Email', sql.NVarChar(255), formData.email || null)
            .input('Phone', sql.NVarChar(50), formData.phone || null)
            .input('LeadSource', sql.NVarChar(100), formData.leadSource || null)
            .input('LeadStatus', sql.NVarChar(100), formData.leadStatus || null)
            .input('AssignedOwner', sql.NVarChar(100), formData.assignedOwner || null)
            .input('Priority', sql.NVarChar(50), formData.priority || null)
            .input('Country', sql.NVarChar(100), formData.country || null)
            .input('State', sql.NVarChar(100), formData.state || null)
            .input('City', sql.NVarChar(100), formData.city || null)
            .input('Industry', sql.NVarChar(100), formData.industry || null)
            .input('CompanySize', sql.NVarChar(65), formData.companySize || null)
            .input('EstBudget', sql.Decimal(18,2), formData.estBudget || null)
            .input('NextAction', sql.NVarChar(100), formData.nextAction || null)
            .input('FollowUpDate', sql.DateTime, formData.followUpDate || null)
            .input('SetReminder', sql.Bit, parseBoolean(formData.setReminder || 0) ||  0)
            .input('PreferredMethod', sql.NVarChar(65), formData.preferredMethod || null)
            .input('BestTime', sql.NVarChar(65), formData.bestTime || null)
            .input('EmailNewsletter', sql.Bit, parseBoolean(formData.emailNewsletter || 0) || 0)
            .input('MarketingUpdates', sql.Bit, parseBoolean(formData.marketingUpdates || 0) || 0)
            .input('Notes', sql.NVarChar(sql.MAX), formData.notes || null)
            .input('OrganizationId', sql.NVarChar(65), formData.organizationId || null)
            .input('CreatedBy', sql.NVarChar(100), req.authUser.username || null)
            .input('ChangedBy', sql.NVarChar(100), req.authUser.username || null)
            .execute('CRMLead_SaveOrUpdate');

        res.status(200).json({
            message: 'CRM Lead saved/updated successfully',
            data: result.recordset[0] // This will return the ID2
        });

    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message, data: null });
    }
};

// end of crmLeadSaveUpdate

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
const getCRMLeadDetails = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
           const result = await pool.request()
            .input('ID2', sql.NVarChar(65), Id ||  null) 
            .input('OrganizationId', sql.NVarChar(65), null)
            .execute('CRMLead_Get');
 
        const data = {
            crmLeadDetails: result.recordset[0],
            // crmLeadItems: itemsApiResponse.recordset
        }
         
        res.status(200).json({
            message: `CRMLead details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCRMLeadDetails
 

const getCRMLeadsList = async (req, res) => {  
    const {organizationId,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        const result = await pool.request()
            .input('ID2', sql.NVarChar(65),  null) 
            .input('OrganizationId', sql.NVarChar(65), organizationId || null)
            .execute('CRMLead_Get');
        
        res.status(200).json({
            message: `CRMLeads List loaded successfully!`,
            data:  result.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCRMLeadsList
  
 
 
 


module.exports =  {crmLeadSaveUpdate,getCRMLeadsList,getCRMLeadDetails} ;
