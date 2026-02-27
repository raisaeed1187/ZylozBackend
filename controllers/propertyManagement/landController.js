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

  
 
const landSaveUpdate = async (req, res) => {
  const formData = req.body;

  let pool, transaction;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    transaction = new sql.Transaction(pool);

    await setTenantContext(pool, req);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);
       console.log('formData');
       console.log(formData);
        const basicInfo = parseIfNeeded(formData.basicInfo);
        
       console.log('basicInfo');
       console.log(basicInfo);
       console.log(basicInfo.ID2);


     
      const result = await request
        .input("ID2", sql.NVarChar(65), basicInfo.ID2 || null)
        .input("PlotCode", sql.NVarChar(50), basicInfo.plotCode || null)
        .input("PlotName", sql.NVarChar(200), basicInfo.plotName)
        .input("Emirate", sql.NVarChar(100), basicInfo.emirate)
        .input("PlotNumber", sql.NVarChar(100), basicInfo.plotNumber)
        .input("Location", sql.NVarChar(200), basicInfo.location)
        .input("Community", sql.NVarChar(200), basicInfo.community)
        .input("Currency", sql.NVarChar(50), basicInfo.currency || 'AED')
        .input("Status", sql.NVarChar(50), basicInfo.status || 'Draft')
        .input("StatusID", sql.Int, basicInfo.statusID || 1)
        .input("OrganizationId", sql.NVarChar(65), basicInfo.organizationId)
        .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
        .input("Username", sql.NVarChar(100), req.authUser.username)
        .execute("Land_SaveUpdate");

      const landID2 = result.recordset[0].ID2;

     
      if (formData.classificationInfo) {
        await landClassificationSaveUpdate(
          formData.classificationInfo,
          landID2,
          req,
          transaction
        );
      }

      if (formData.areaBoundryInfo) {
        await landAreaBoundarySaveUpdate(
          formData.areaBoundryInfo,
          landID2,
          req,
          transaction
        );
      }

      if (formData.zoningFormData) {
        await landZoningSaveUpdate(
          formData.zoningFormData,
          landID2,
          req,
          transaction
        );
      }

      await transaction.commit();

      res.status(200).json({
        message: "Land saved/updated successfully",
        data: landID2,
      });
    } catch (err) {
      if (transaction) await transaction.rollback();
      console.error("SQL ERROR:", err);
      return res.status(400).json({ message: err.message });
    }
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
 
const parseIfNeeded = (data) => {
  if (!data) return null;
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
};

// end of landSaveUpdate

const landClassificationSaveUpdate = async (
  data,
  landID,
  req,
  transaction
) => {

    try {
         
        const request = new sql.Request(transaction);

        await request
            .input("ID2", sql.NVarChar(65), data.ID2 || null)
            .input("LandID", sql.NVarChar(65), landID)
            .input("OwnershipType", sql.NVarChar(100), data.ownershipType)
            .input("LandUseType", sql.NVarChar(200), data.landUseType)
            .input("DevelopmentPotential", sql.NVarChar(100), data.developmentPotential)
            .input("Topography", sql.NVarChar(200), data.topography)
            .input("SoilType", sql.NVarChar(100), data.soilType)
            .input("OrganizationId", sql.NVarChar(65), req.authUser.organizationId)
            .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
            .input("CreatedBy", sql.NVarChar(65), req.authUser.username)
            .input("ChangedBy", sql.NVarChar(65), req.authUser.username)
            .execute("LandClassification_SaveOrUpdate");

    } catch (error) {
        throw error;
    }
};

// end of landClassificationSaveUpdate


const landAreaBoundarySaveUpdate = async (
  data,
  landID,
  req,
  transaction
) => {

    try {

  const request = new sql.Request(transaction);

  await request
    .input("ID2", sql.NVarChar(65), data.ID2 || null)
    .input("LandID", sql.NVarChar(65), landID)
    .input("TotalArea", sql.Decimal(18, 2), data.totalArea)
    .input("TotalAreaUnit", sql.NVarChar(20), data.totalAreaUnit)
    .input("AreaSqft", sql.Decimal(18, 2), data.areaSqft)
    .input("AreaSqftUnit", sql.NVarChar(20), data.areaSqftUnit)
    .input("Frontage", sql.Decimal(18, 2), data.frontage)
    .input("FrontageUnit", sql.NVarChar(20), data.frontageUnit)
    .input("NorthBoundary", sql.NVarChar(50), data.northBoundry)
    .input("SouthBoundary", sql.NVarChar(50), data.southBoundry)
    .input("EastBoundary", sql.NVarChar(50), data.eastBoundry)
    .input("WestBoundary", sql.NVarChar(50), data.westBoundry)
    .input("WestBoundary", sql.NVarChar(50), data.westBoundry)
    .input("BoundaryUnit", sql.NVarChar(20), data.boundaryUnit)
    .input("OrganizationId", sql.NVarChar(65), req.authUser.organizationId)
    .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
    .input("CreatedBy", sql.NVarChar(65), req.authUser.username)
    .input("ChangedBy", sql.NVarChar(65), req.authUser.username)
    .execute("LandAreaBoundary_SaveOrUpdate");

    } catch (error) {
        throw error;
    }

};


// end of landAreaBoundarySaveUpdate

const landZoningSaveUpdate = async (data, landID, req, transaction) => {

    try {


    const request = new sql.Request(transaction);

  await request
    .input("ID2", sql.NVarChar(65), data.ID2 || null)
    .input("LandID", sql.NVarChar(65), landID)
    .input("PrimaryZone", sql.NVarChar(200), data.primaryZone)
    .input("SubZone", sql.NVarChar(200), data.subZone)
    .input("ZoningAuthority", sql.NVarChar(200), data.zoningAuthority)
    .input("ResidentialUsage", sql.NVarChar(20), data.residentialUsage)
    .input("CommercialUsage", sql.NVarChar(20), data.commercialUsage)
    .input("RetailUsage", sql.NVarChar(20), data.retailUsage)
    .input("ApprovalStatus", sql.NVarChar(50), data.approvalStatus)
    .input("ApprovalIssueDate", sql.Date, data.approvalIssueDate)
    .input("ApprovalValidUntil", sql.Date, data.approvalValidUntil)
    .input("OrganizationId", sql.NVarChar(65), req.authUser.organizationId)
    .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
    .input("ChangedBy", sql.NVarChar(65), req.authUser.username)
    .input("CreatedBy", sql.NVarChar(65), req.authUser.username)
    .execute("SaveOrUpdateLandZoning");

    } catch (error) {
        throw error;
    }
};

// end of landZoningSaveUpdate

  
async function licenseDocumentSaveUpdate(req, LicenseId, transaction) {
    try {
        const formData = req.body;
        const documentsArray = formData.documents ? JSON.parse(formData.documents) : [];
        const files = req.files || [];

        for (const doc of documentsArray) {
             
            const matchingFile = files.find(f => f.fieldname === doc.fileKey);

            
            let fileUrl = null;
            let fileName = doc.fileName || null;
            let fileType = doc.documentType || null;

            

            if (matchingFile) { 
                const uploaded = await uploadDocument(matchingFile);
                fileUrl = uploaded.fileUrl;
                fileName = matchingFile.originalname;  
                fileType = matchingFile.mimetype;     
            }
 
          
            const request = new sql.Request(transaction);
            await request
                .input("ID2", sql.NVarChar(65), "0")
                .input("LicenseId", sql.NVarChar(65), LicenseId)
                .input("FileName", sql.NVarChar(255), fileName)
                .input("FileUrl", sql.NVarChar(sql.MAX), fileUrl)
                .input("FileType", sql.NVarChar(100), fileType)
                .input("DocumentType", sql.NVarChar(100), doc.documentType)
                .input("Size", sql.Int, doc.size || null)


                .execute("LicenseDocuments_SaveOrUpdate");

        }

        return true;

    } catch (error) {
        console.error('Error saving license documents:', error);
        throw error;
    }
}


async function uploadDocument(file){ 
    try {
         

        if(file){
            const blobName = file.originalname;
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);
            const uploadFilePath = file.path;
    
            // Upload file to Azure Blob Storage
            const uploadStream = fs.createReadStream(uploadFilePath);
            await blockBlobClient.uploadStream(uploadStream);
            fs.unlinkSync(uploadFilePath); // Delete local file
    
            const fileUrl = blockBlobClient.url;
            console.log('fileUrl');
            console.log(fileUrl);
            const fileInfo = {
                fileName: blobName.split('.').slice(0, -1).join('.'),
                fileUrl:fileUrl
            }
            return fileInfo

        }else{
            const fileInfo = {
                fileName: '',
                fileUrl:''
            }
            return fileInfo;
        }
    } catch (error) {
        console.error(error);
        throw new Error(error.message);
    }
}
// end of uploadDocument

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
const getLicenseDetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
 
        query = `exec License_Get '${Id}'`;   
        // const apiResponse = await pool.request().query(query);

        const apiResponse = await pool.request() 
                            .input('ID2', sql.NVarChar(65),  Id) 
                            .input('TenantId', sql.NVarChar(65), req.authUser.tenantId) 
                            .execute('License_Get');
 

        const documentApiResponse = await pool.request() 
                    .input('LicenseId', sql.NVarChar(65),  Id)  
                    .execute('LicenseDocuments_Get');

        const details = {
            ...apiResponse.recordset[0],
            documents:documentApiResponse.recordset
        }          
        const data = {
            licenseDetails: details, 
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `License details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getLicenseDetails
 

const getLicensesList = async (req, res) => {  
    const {organizationId,Id,IsForPO} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
           
          
        const apiResponse = await pool.request() 
                            .input('ID2', sql.NVarChar(65),  null)
                            .input('OrganizationId', sql.NVarChar(65), organizationId || null) 
                            .input('TenantId', sql.NVarChar(65), req.authUser.tenantId) 
                            .execute('License_Get');
 
        
        res.status(200).json({
            message: `Licenses List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getLicensesList
 

const getLicenseSummary = async (req, res) => {  
    const {organizationId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);   
            await setTenantContext(pool,req);
  
        const apiResponse = await pool.request() 
                            .input('OrganizationId', sql.NVarChar(65),  organizationId) 
                            .input('TenantId', sql.NVarChar(65), req.authUser.tenantId) 
                            .execute('License_GetSummary');
  
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `License summary loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getLicenseSummary
 
 


module.exports =  { landSaveUpdate,getLicensesList,getLicenseDetails,getLicenseSummary} ;
