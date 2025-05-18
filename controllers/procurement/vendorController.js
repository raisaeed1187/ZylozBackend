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

  
const vendorSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            const pool = await sql.connect(config);
              
            await pool.request()
            .input("ID2", sql.NVarChar(65), formData.ID2)
            .input("VendorName", sql.NVarChar(255), formData.vendorName)
            .input("VendorCode", sql.NVarChar(100), formData.vendorCode)
            .input("TradeLicenseNumber", sql.NVarChar(100), formData.tradeLicenseNumber)
            .input("TradeLicenseExpiryDate", sql.Date, formData.tradeLicenseExpiryDate || null)
            .input("VATNumber", sql.NVarChar(100), formData.vatNumber)
            .input("YearsOfExperience", sql.Int, formData.yearsOfExperience)
            .input("ContactPerson", sql.NVarChar(255), formData.contactPerson)
            .input("ContactNumber", sql.NVarChar(50), formData.contactNumber)
            .input("Email", sql.NVarChar(255), formData.email)
            .input("Address", sql.NVarChar(sql.MAX), formData.address)
            .input("City", sql.NVarChar(100), formData.city)
            .input("Country", sql.NVarChar(100), formData.country)
            .input("BankName", sql.NVarChar(255), formData.bankName)
            .input("BankAccountNumber", sql.NVarChar(100), formData.bankAccountNumber)
            .input("IBAN", sql.NVarChar(100), formData.iban)
            .input("SWIFTCode", sql.NVarChar(100), formData.swiftCode)
            .input("StatusId", sql.Int, formData.statusId === 'null' ? null : formData.statusId || null)
            .input("CreatedBy", sql.NVarChar(100), formData.createdBy)
            .execute("dbo.Vendor_SaveUpdate");

    

            res.status(200).json({
                message: 'vendor saved/updated',
                data: '' //result
            });
           
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of vendorSaveUpdate
 

 
 
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
 
const getVendorDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';

        if (Id){
            query = `exec Vendor_GetDetails '${Id}'`;  

        } else{
            query = `exec Vendor_GetDetails `;  

        }
         
         
        const apiResponse = await pool.request().query(query); 
         
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Vendor details loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getVendorDetails
 

const getVendorsList = async (req, res) => {  
    const {date,isMonthly} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        query = `exec Vendor_GetDetails `;   
         
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Vendors List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getVendorsList

 


module.exports =  {vendorSaveUpdate,getVendorsList,getVendorDetails} ;
