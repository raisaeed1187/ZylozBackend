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

  
const contractSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
              
            const result = await pool.request()
            .input("ID2", sql.NVarChar(65), formData.ID2)
            .input("CustomerId", sql.NVarChar(65), formData.CustomerId)
            .input("ContactPerson", sql.VarChar(100), formData.ContactPerson)
            .input("CustomerEmail", sql.VarChar(255), formData.CustomerEmail)
            .input("CustomerPhone", sql.VarChar(50), formData.CustomerPhone)
            .input("ContractCode", sql.VarChar(50), formData.ContractCode)
            .input("ContractName", sql.VarChar(255), formData.ContractName)
            .input("ContractType", sql.VarChar(100), formData.ContractType)
            .input("StartDate", sql.VarChar(100), formData.StartDate)
            .input("EndDate", sql.VarChar(100), formData.EndDate)
            .input("AnnualAmount", sql.Decimal(18, 2), formData.AnnualAmount)
            .input("TotalAmount", sql.Decimal(18, 2), formData.TotalAmount)
            .input("ContractIncharge", sql.VarChar(100), formData.ContractIncharge) 
            .input("StatusId", sql.VarChar(25), formData.StatusId == 'null' ? null : formData.StatusId  || null) 
            .input("QuotationId", sql.VarChar(100), formData.QuotationId) 
            .input("createdBy", sql.VarChar(100), formData.createdBy)
            .input("OrganizationId", sql.VarChar(65), formData.organizationId || null) 
            .input("BranchId", sql.VarChar(65), formData.branchId || null) 

            .output('ID', sql.NVarChar(100)) 
            .execute("dbo.ClientContract_SaveUpdate");
    
            const newID = result.output.ID;
            if(formData.properties){ 
                contractPropertySaveUpdate(req,newID)
            }
            if(formData.locations){ 
                contractLocationSaveUpdate(req,newID,true)
            }

            res.status(200).json({
                message: 'contract saved/updated',
                data: '' //result
            });
           
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of contractSaveUpdate

async function contractLocationSaveUpdate(req,contractId,isContract){
    const formData = req.body; 
    const properties = JSON.parse(formData.locations); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            const pool = await sql.connect(config);
            try { 
                if (properties) {
                    for (let item of properties) {  
                        if(item.ID2){
                            await pool.request()
                                .input('ID', sql.Int, item.ID || 0)
                                .input('ContractID', sql.NVarChar(65), contractId)
                                .input('LocationID', sql.NVarChar(65), item.ID2)
                                .input('IsContract', sql.Bit, isContract ? 1 : 0) 
                                .execute('ContractLocation_SaveOrUpdate');
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
// end of contractLocationSaveUpdate


async function contractPropertySaveUpdate(req,contractId){
    const formData = req.body; 
    const properties = JSON.parse(formData.properties); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            const pool = await sql.connect(config);
            try { 
                if (properties) {
                    for (let item of properties) {  
                        if(item.ID2){
                            await pool.request()
                                .input('ID', sql.Int, item.ID || 0)
                                .input('ContractID', sql.NVarChar(65), contractId)
                                .input('PropertyID', sql.NVarChar(65), item.ID2)
                                .execute('ContractProperty_SaveOrUpdate');
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
// end of contractPropertySaveUpdate


const projectSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
              
            const result = await pool.request()
                .input("ID2", sql.NVarChar(65), formData.ID2 || null)
                .input("CustomerId", sql.NVarChar(65), formData.CustomerId)
                .input("ContactPerson", sql.VarChar(100), formData.ContactPerson || null)
                .input("CustomerEmail", sql.VarChar(255), formData.CustomerEmail || null)
                .input("CustomerPhone", sql.VarChar(50), formData.CustomerPhone || null)
                .input("ProjectCode", sql.VarChar(50), formData.ProjectCode)
                .input("ProjectName", sql.VarChar(255), formData.ProjectName)
                .input("ProjectType", sql.VarChar(100), formData.ProjectType)
                .input("StartDate", sql.VarChar(100), formData.StartDate || null)
                .input("EndDate", sql.VarChar(100), formData.EndDate || null)
                .input("AnnualAmount", sql.Decimal(18, 2), formData.AnnualAmount)
                .input("TotalAmount", sql.Decimal(18, 2), formData.TotalAmount)
                .input("ProjectIncharge", sql.VarChar(100), formData.ProjectIncharge || null)
                .input("Description", sql.VarChar(sql.MAX), formData.Description || null)
                .input("StatusId", sql.VarChar(25), formData.StatusId == 'null' ? null : formData.StatusId  || null)
                .input("QuotationId", sql.VarChar(100), formData.QuotationId) 
                .input("CreatedBy", sql.VarChar(100), formData.createdBy || null)
                .input("OrganizationId", sql.VarChar(65), formData.organizationId || null) 
                .input("BranchId", sql.VarChar(65), formData.branchId || null) 
                .output('ID', sql.NVarChar(100))  
                .execute("dbo.ClientProject_SaveUpdate");
    
            const newID = result.output.ID;

            if(formData.locations){ 
                contractLocationSaveUpdate(req,newID,false)
            }

            res.status(200).json({
                message: 'project saved/updated',
                data: '' //result
            });
           
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of projectSaveUpdate

 
 
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
 
const getContractDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        
        if (Id) {
            query = `exec ClientContract_Get '${Id}'`;  
            
        }else{
            
        }
 
        const apiResponse = await pool.request().query(query); 
         
        
         
        res.status(200).json({
            message: `Contract details loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getContractDetails

const getProjectDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';

        if (Id){
            query = `exec ClientProject_Get '${Id}'`;  

        } else{
            query = `exec ClientProject_Get `;  

        }
         
         
        const apiResponse = await pool.request().query(query); 
         
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Project details loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getProjectDetails

const getContractsList = async (req, res) => {  
    const {organizationId,date,isMonthly} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec ClientContract_GetList '${organizationId}'`;   
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Contracts List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getContractsList

const getAttendanceContractsList = async (req, res) => {  
    const {organizationId,date,isMonthly} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec Attendance_ClientContract_GetList '${organizationId}'`;   
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Contracts List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAttendanceContractsList


const getAttendanceContractLocationsList = async (req, res) => {  
    const {contractId} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec Attendance_ClientContract_Locations '${contractId}'`;   
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Contract Locations List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getAttendanceContractLocationsList


const propertySaveUpdate = async (req,res)=>{
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
            .input('PropertyCode', sql.NVarChar(50), formData.PropertyCode)
            .input('PropertyName', sql.NVarChar(255), formData.PropertyName)
            .input('PropertyType', sql.NVarChar(100), formData.PropertyType)
            .input('PropertyUse', sql.NVarChar(100), formData.PropertyUse)
            .input('Purpose', sql.NVarChar(100), formData.Purpose)
            .input('PlotArea', sql.Decimal(18, 2), formData.PlotArea)
            .input('BuiltUpArea', sql.Decimal(18, 2), formData.BuiltUpArea)
            .input('BuildingCompletionCertificateDate', sql.NVarChar(100), formData.BuildingCompletionCertificateDate)
            .input('Status', sql.NVarChar(100), formData.Status)
            .input('OwnerName', sql.NVarChar(255), formData.OwnerName)
            .input('OwnershipType', sql.NVarChar(100), formData.OwnershipType)
            .input('EmailID', sql.NVarChar(255), formData.EmailID)
            .input('MobileNo', sql.NVarChar(20), formData.MobileNo)
            .input('Address', sql.NVarChar(sql.MAX), formData.Address)
            .input('PropertyValuation', sql.Decimal(18, 2), formData.PropertyValuation)
            .input('Amenities', sql.NVarChar(sql.MAX), formData.Amenities)
            .input('PropertyPhotos', sql.NVarChar(sql.MAX), formData.PropertyPhotos)
            .input('RegistrationCertificate', sql.NVarChar(255), formData.RegistrationCertificate)
            .input('AddressLine1', sql.NVarChar(255), formData.AddressLine1)
            .input('AddressLine2', sql.NVarChar(255), formData.AddressLine2)
            .input('CommunityArea', sql.NVarChar(255), formData.CommunityArea)
            .input('City', sql.NVarChar(100), formData.City)
            .input('Emirate', sql.NVarChar(100), formData.Emirate)
            .input('PostalCode', sql.NVarChar(20), formData.PostalCode)
            .input('Country', sql.NVarChar(100), formData.Country || 'UAE')
            .input('MakaniNumber', sql.NVarChar(100), formData.MakaniNumber)
            .input('Latitude', sql.NVarChar(100), formData.Latitude)
            .input('Longitude', sql.NVarChar(100), formData.Longitude)
            .input('StatusId', sql.Int, formData.statusId)
            .input('CreatedBy', sql.NVarChar(100), formData.CreatedBy)
            .output('ID', sql.NVarChar(100))
            .execute('Property_SaveOrUpdate');
 


            res.status(200).json({
                message: 'contract saved/updated',
                data: '' //result
            });
           
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of propertySaveUpdate

const getPropertyDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';

        if (Id){
            query = `exec Property_Get '${Id}'`;   
        } else{
            query = `exec Property_Get `;   
        }
         
         
        const apiResponse = await pool.request().query(query); 
         
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Property details loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPropertyDetails
// end of property


const locationSaveUpdate = async (req,res)=>{
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
            .input('LocationCode', sql.NVarChar(100), formData.LocationCode)
            .input('LocationName', sql.NVarChar(200), formData.LocationName)
            .input('AddressLine1', sql.NVarChar(255), formData.AddressLine1 || null)
            .input('AddressLine2', sql.NVarChar(255), formData.AddressLine2 || null)
            .input('City', sql.NVarChar(100), formData.City || null)
            .input('Emirate', sql.NVarChar(100), formData.Emirate || null)
            .input('PostalCode', sql.NVarChar(20), formData.PostalCode || null)
            .input('Country', sql.NVarChar(100), formData.Country || 'UAE')
            .input('MakaniNumber', sql.NVarChar(50), formData.MakaniNumber || null)
            .input('Latitude', sql.NVarChar(50), formData.Latitude || null)
            .input('Longitude', sql.NVarChar(50), formData.Longitude || null)
            .input('StatusId', sql.Int, formData.statusId || 1)
            .input('CreatedBy', sql.NVarChar(100), formData.CreatedBy)
            .output('ID', sql.NVarChar(100))
            .execute('Location_SaveOrUpdate');
 


            res.status(200).json({
                message: 'location saved/updated',
                data: '' //result
            });
           
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of locationSaveUpdate

const getLocationDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';

        if (Id){
            query = `exec Location_Get '${Id}'`;   
        } else{
            query = `exec Location_Get `;   
        }
         
         
        const apiResponse = await pool.request().query(query); 
         
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Location details loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getLocationDetails

const getContractLocations = async (req, res) => {  
    const {Id,IsForContract} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        const locationsQuery = `exec ContractLocation_Get '${Id}',${IsForContract ? 1 : 0}`;   
        const locationsApiResponse = await pool.request().query(locationsQuery); 
           
        res.status(200).json({
            message: `Contract locations loaded successfully!`,
            data: locationsApiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getContractLocations

 


module.exports =  {getAttendanceContractLocationsList,getAttendanceContractsList,getContractLocations,getLocationDetails,locationSaveUpdate,getPropertyDetails,propertySaveUpdate,projectSaveUpdate,contractSaveUpdate,getContractsList,getProjectDetails,getContractDetails} ;
