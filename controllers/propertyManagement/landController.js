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

     
      const parseField = (field) => {
        if (!field) return null;
        if (typeof field === 'object') return field;  
        try {
          return JSON.parse(field);
        } catch {
          return null;
        }
      };

      const basicInfo          = parseField(formData.basicInfo);
      const classificationInfo = parseField(formData.classificationInfo);
      const areaBoundryInfo    = parseField(formData.areaBoundryInfo);
      const zoningFormData     = parseField(formData.zoningFormData);
      const financialInfo      = parseField(formData.financialInfo);
      const ownershipInfo      = parseField(formData.ownershipInfo);

      console.log('basicInfo', basicInfo);

      if (!basicInfo) {
        throw new Error('basicInfo is missing or invalid');
      }

      const result = await request
        .input("ID2",            sql.NVarChar(65),  basicInfo.ID2 || null)
        .input("PlotCode",       sql.NVarChar(50),  basicInfo.plotCode || null)
        .input("PlotName",       sql.NVarChar(200), basicInfo.plotName)
        .input("Emirate",        sql.NVarChar(100), basicInfo.emirate)
        .input("PlotNumber",     sql.NVarChar(100), basicInfo.plotNumber)
        .input("Location",       sql.NVarChar(200), basicInfo.location)
        .input("Community",      sql.NVarChar(200), basicInfo.community)
        .input("Currency",       sql.NVarChar(50),  basicInfo.currency || 'AED')
        .input("Status",         sql.NVarChar(50),  basicInfo.status || 'Draft')
        .input("StatusID",       sql.Int,           basicInfo.statusID || 1)
        .input("OrganizationId", sql.NVarChar(65),  basicInfo.organizationId)
        .input("TenantId",       sql.NVarChar(65),  req.authUser.tenantId)
        .input("Username",       sql.NVarChar(100), req.authUser.username)
        .execute("Land_SaveUpdate");

        const landID2 = result.recordset[0].ID2;

        if (classificationInfo) {
            await landClassificationSaveUpdate(classificationInfo, landID2, req, transaction);
        }

        if (areaBoundryInfo) {
            await landAreaBoundarySaveUpdate(areaBoundryInfo, landID2, req, transaction);
        }

        if (zoningFormData) {
            await landZoningSaveUpdate(zoningFormData, landID2, req, transaction);
        }
        if (financialInfo) {
            await landFinancialSaveUpdate(financialInfo, landID2, req, transaction);
        } 
        if (ownershipInfo) {
            await landOwnershipSaveUpdate(ownershipInfo, landID2, req, transaction );
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

const landFinancialSaveUpdate = async (data, landID, req, transaction) => {

    try {
    const request = new sql.Request(transaction);

    const result = await request
        .input("ID2",                  sql.NVarChar(65),   data.ID2 || null)
        .input("LandID",               sql.NVarChar(65),   landID)
        .input("PurchaseCost",         sql.Decimal(18, 5), data.purchaseCost)
        .input("PurchaseDate",         sql.Date,           data.purchaseDate)
        .input("CostPerSqm",           sql.Decimal(18, 5), data.costPerSqm)
        .input("PaymentMethod",        sql.NVarChar(100),  data.paymentMethod)
        .input("MarketValue",          sql.Decimal(18, 5), data.marketValue)
        .input("ValuationDate",        sql.Date,           data.valuationDate)
        .input("ValuationMethod",      sql.NVarChar(200),  data.valuationMethod)
        .input("Valuer",               sql.NVarChar(200),  data.valuer)
        .input("AnnualServiceCharges", sql.Decimal(18, 5), data.annualServiceCharges)
        .input("MunicipalityFees",     sql.Decimal(18, 5), data.municipalityFees)
        .input("InsurancePremium",     sql.Decimal(18, 5), data.insurancePremium)
        .input("OrganizationId",       sql.NVarChar(65),   req.authUser.organizationId)
        .input("TenantId",             sql.NVarChar(65),   req.authUser.tenantId)
        .input("CreatedBy",            sql.NVarChar(100),  req.authUser.username)
        .input("ChangedBy",            sql.NVarChar(100),  req.authUser.username)
        .execute("LandFinancial_SaveOrUpdate");

    } catch (error) {
        throw error;
    }
}; 
// end of landFinancialSaveUpdate


const landOwnershipSaveUpdate = async (data, landID, req, transaction) => {

    try {

    // 1 ── Save the top-level ownership card (1-to-1)
    const ownershipReq = new sql.Request(transaction);
    const ownershipResult = await ownershipReq
        .input("ID2",                 sql.NVarChar(65),  data.ID2 || null)
        .input("LandID",              sql.NVarChar(65),  landID)
        .input("PrimaryOwnerName",    sql.NVarChar(200), data.primaryOwnerName)
        .input("PrimaryOwnerType",    sql.NVarChar(100), data.primaryOwnerType)
        .input("PrimaryOwnershipPct", sql.Decimal(5, 2), data.primaryOwnershipPct)
        .input("PrimaryRegDate",      sql.Date,          data.primaryRegDate)
        .input("ContactPerson",       sql.NVarChar(200), data.contactPerson)
        .input("ContactEmail",        sql.NVarChar(200), data.contactEmail)
        .input("ContactPhone",        sql.NVarChar(50),  data.contactPhone)
        .input("EmiratesId",          sql.NVarChar(50),  data.emiratesId)
        .input("TradeLicense",        sql.NVarChar(100), data.tradeLicense)
        .input("LicenseExpiry",       sql.Date,          data.licenseExpiry)
        .input("TaxRegistration",     sql.NVarChar(100), data.taxRegistration)
        .input("RegisteredAddress",   sql.NVarChar(300), data.registeredAddress)
        .input("OrganizationId",      sql.NVarChar(65),  req.authUser.organizationId)
        .input("TenantId",            sql.NVarChar(65),  req.authUser.tenantId)
        .input("CreatedBy",           sql.NVarChar(100), req.authUser.username)
        .input("ChangedBy",           sql.NVarChar(100), req.authUser.username)
        .execute("LandOwnership_SaveOrUpdate");

    const ownershipID = ownershipResult.recordset[0].ID2;

    // 2 ── Soft-delete existing owners then re-insert the full list
    const deleteReq = new sql.Request(transaction);
    await deleteReq
        .input("LandID",    sql.NVarChar(65),  landID)
        .input("ChangedBy", sql.NVarChar(100), req.authUser.username)
        .execute("LandOwner_DeleteByLandID");

    for (let i = 0; i < (data.owners || []).length; i++) {
        const owner = data.owners[i];
        const ownerReq = new sql.Request(transaction);
        await ownerReq
            .input("ID2",               sql.NVarChar(65),  null)   // always new after delete
            .input("LandID",            sql.NVarChar(65),  landID)
            .input("OwnershipID",       sql.NVarChar(65),  ownershipID)
            .input("SortOrder",         sql.Int,           i)
            .input("OwnerName",         sql.NVarChar(200), owner.ownerName)
            .input("OwnerType",         sql.NVarChar(100), owner.ownerType)
            .input("OwnershipPercent",  sql.Decimal(5, 2), owner.ownershipPercent)
            .input("RegistrationDate",  sql.Date,          owner.registrationDate)
            .input("ContactPerson",     sql.NVarChar(200), owner.contactPerson)
            .input("Email",             sql.NVarChar(200), owner.email)
            .input("Phone",             sql.NVarChar(50),  owner.phone)
            .input("EmiratesId",        sql.NVarChar(50),  owner.emiratesId)
            .input("TradeLicense",      sql.NVarChar(100), owner.tradeLicense)
            .input("LicenseExpiry",     sql.Date,          owner.licenseExpiry)
            .input("TaxRegistration",   sql.NVarChar(100), owner.taxRegistration)
            .input("RegisteredAddress", sql.NVarChar(300), owner.registeredAddress)
            .input("OrganizationId",    sql.NVarChar(65),  req.authUser.organizationId)
            .input("TenantId",          sql.NVarChar(65),  req.authUser.tenantId)
            .input("CreatedBy",         sql.NVarChar(100), req.authUser.username)
            .input("ChangedBy",         sql.NVarChar(100), req.authUser.username)
            .execute("LandOwner_SaveOrUpdate");
    }

    // 3 ── Transfer history (upsert each record)
    for (let i = 0; i < (data.transferHistory || []).length; i++) {
        const t = data.transferHistory[i];
        const tReq = new sql.Request(transaction);
        await tReq
            .input("ID2",           sql.NVarChar(65),   t.id?.startsWith("t") ? null : t.id)
            .input("LandID",        sql.NVarChar(65),   landID)
            .input("SortOrder",     sql.Int,            i)
            .input("Description",   sql.NVarChar(300),  t.description)
            .input("TransferDate",  sql.Date,           t.date)
            .input("Note",          sql.NVarChar(1000), t.note)
            .input("OrganizationId",sql.NVarChar(65),   req.authUser.organizationId)
            .input("TenantId",      sql.NVarChar(65),   req.authUser.tenantId)
            .input("CreatedBy",     sql.NVarChar(100),  req.authUser.username)
            .input("ChangedBy",     sql.NVarChar(100),  req.authUser.username)
            .execute("LandTransferHistory_SaveOrUpdate");
    }

     
    for (let i = 0; i < (data.documents || []).length; i++) {
        const doc = data.documents[i];
        const dReq = new sql.Request(transaction);
        await dReq
            .input("ID2",           sql.NVarChar(65),  doc.id?.startsWith("d") ? null : doc.id)
            .input("LandID",        sql.NVarChar(65),  landID)
            .input("SortOrder",     sql.Int,           i)
            .input("DocumentName",  sql.NVarChar(300), doc.name)
            .input("FileUrl",       sql.NVarChar(500), doc.fileUrl || null)
            .input("FileType",      sql.NVarChar(50),  doc.fileType || null)
            .input("FileSizeKb",    sql.Int,           doc.fileSizeKb || null)
            .input("OrganizationId",sql.NVarChar(65),  req.authUser.organizationId)
            .input("TenantId",      sql.NVarChar(65),  req.authUser.tenantId)
            .input("CreatedBy",     sql.NVarChar(100), req.authUser.username)
            .input("ChangedBy",     sql.NVarChar(100), req.authUser.username)
            .execute("LandDocument_SaveOrUpdate");
    }

    } catch (error) {
        throw error;
    }

};

// end of landOwnershipSaveUpdate
  
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
 
const cleanStr = (s) => (s || "").replace(/[\r\n\t]/g, " ").trim();

const landDevFeasibilitySave = async (req, res) => {
  const formData = req.body;
  let pool, transaction;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    pool        = await sql.connect(config);
    transaction = new sql.Transaction(pool);

    await setTenantContext(pool, req);
    await transaction.begin();

    try {
      const body = req.body;

        const parseField = (field) => {
            if (!field) return null;
            if (typeof field === 'object') return field;  
            try {
            return JSON.parse(field);
            } catch {
            return null;
            }
        };

      // ── Extract the 5 sections from the JSON payload ──────────────────────
      const params   = parseField(formData.Parameters)        || {};
      const unitMix  = parseField(formData.UnitMix)           || {};
      const unitMixItems  = parseField(formData.UnitMixItems)|| {};

      const developmentCostItems  = parseField(formData.DevelopmentCostItems)   || {};
      const finSum   = parseField(formData.FinancialSummary)  || {};
      const partners = parseField(formData.JVPartners)        || [];

      // ── Basic validation ──────────────────────────────────────────────────
      if (!params.LandID) {
        throw new Error("Parameters.LandID is required");
      }

      const LandID       = String(params.LandID);
      const Currency     = params.Currency     || "AED";
      const CurrencyRate = params.CurrencyRate || 1;
      const organizationId = params.organizationId || null;


      const request = new sql.Request(transaction);

      const result = await request
        // ── Common ──────────────────────────────────────────────────────────
        .input("ID2",              sql.NVarChar(65),    params.ID2 || null)
        .input("LandID",              sql.NVarChar(65),    String(params.LandID))
        .input("OrganizationId",      sql.NVarChar(65),    organizationId)
        .input("TenantId",            sql.NVarChar(65),    req.authUser.tenantId)
        .input("UserID",              sql.NVarChar(65),    req.authUser.username)
        .input("Currency",            sql.NVarChar(10),    params.Currency     || "AED")
        .input("CurrencyRate",        sql.Decimal(18, 6),  params.CurrencyRate || 1)

        // ── Section 1: Development Parameters ───────────────────────────────
        .input("PlotArea_m2",         sql.Decimal(18, 4),  params.PlotArea_m2   || 0)
        .input("MaxBUA_m2",           sql.Decimal(18, 4),  params.MaxBUA_m2     || 0)
        .input("FAR",                 sql.Decimal(10, 4),  params.FAR           || 0)
        .input("MaxHeight",           sql.Decimal(10, 2),  params.MaxHeight     || 0)
        .input("GroundCovPct",        sql.Decimal(10, 4),  params.GroundCovPct  || 0)
        .input("Setback_m",           sql.Decimal(10, 2),  params.Setback       || 0)
        .input("ParkingSpaces",       sql.Int,             params.Parking       || 0)
        .input("ZoningType",          sql.NVarChar(100),   params.ZoningType    || "")

        // ── Section 2: Unit Mix ──────────────────────────────────────────────
        .input("BUA_sqft",            sql.Decimal(18, 4),  unitMix.BUA_sqft      || 0)
        .input("NSA_sqft",            sql.Decimal(18, 4),  unitMix.NSA_sqft      || 0)
        .input("FAR_Used",            sql.Decimal(10, 4),  unitMix.FAR_Used      || 0)
        .input("CovPct_Used",         sql.Decimal(10, 4),  unitMix.CovPct_Used   || 0)
        .input("Efficiency_Pct",      sql.Decimal(10, 4),  unitMix.Efficiency_Pct|| 80)
        .input("TotalUnits",          sql.Int,             unitMix.TotalUnits    || 0)
        .input("TotalSellable",       sql.Decimal(18, 4),  unitMix.TotalSellable || 0)
        .input("TotalRevenue",        sql.Decimal(18, 2),  unitMix.TotalRevenue  || 0)
         
        // ── Section 3: Development Cost ──────────────────────────────────────
        .input("TotalCost",           sql.Decimal(18, 2),  finSum.TotalCost || 0)
          
        // ── Section 4: Financial Summary ─────────────────────────────────────
        .input("GrossProfit",         sql.Decimal(18, 2),  finSum.GrossProfit           || 0)
        .input("ProfitMargin_Pct",    sql.Decimal(10, 4),  finSum.ProfitMargin_Pct      || 0)
        .input("ROI_Pct",             sql.Decimal(10, 4),  finSum.ROI_Pct               || 0)
        .input("CostPerSellableSqft", sql.Decimal(18, 2),  finSum.CostPerSellableSqft   || 0)

        // ── Section 5: JV Partners ────────────────────────────────────────────
          
        .execute("LandDevFeasibility_SaveAll");

        if (unitMixItems) {  
            await landDevFeasibility_UnitMixRow_Save(unitMixItems,LandID,organizationId, Currency, CurrencyRate, req, transaction); 
        } 
        if (developmentCostItems) {  
            await landDevFeasibility_CostItem_Save(developmentCostItems,LandID,organizationId,finSum.TotalCost , Currency, CurrencyRate, req, transaction); 
        } 
        if (partners) {  
            await landDevFeasibility_JVPartner_Save(partners,LandID,organizationId, Currency, CurrencyRate, req, transaction); 
        }  
           
      await transaction.commit();

      return res.status(200).json({
        message:  "Feasibility saved successfully", 
        data:''
      });

    } catch (err) {
      if (transaction) await transaction.rollback();
      console.error("LandDevFeasibility Save SQL ERROR:", err);
      return res.status(400).json({ message: err.message });
    }

  } catch (error) {
    console.error("LandDevFeasibility Save ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};

// end of


const landDevFeasibility_UnitMixRow_Save = async (data, landID,organizationId, currency, currencyRate, req, transaction) => {
  try {
    for (let i = 0; i < data.length; i++) {
        const item =  data[i];
        const request = new sql.Request(transaction);
        await request
        .input("ID2",             sql.NVarChar(65),   item.ID2             || null)
        .input("LandID",          sql.NVarChar(65),   landID)
        .input("OrganizationId",  sql.NVarChar(65),   organizationId)
        .input("TenantId",        sql.NVarChar(65),   req.authUser.tenantId)
        .input("Currency",        sql.NVarChar(10),   currency)
        .input("CurrencyRate",    sql.Decimal(18,6),  currencyRate)
        .input("SortOrder",       sql.Int,            i + 1)
        .input("UnitType",        sql.NVarChar(100),  cleanStr(item.UnitType))
        .input("AvgSize_sqft",    sql.Decimal(18,4),  item.AvgSize_sqft    || 0)
        .input("UnitCount",       sql.Int,            item.Count           || 0)
        .input("SqftPrice",       sql.Decimal(18,2),  item.SqftPrice_AED   || 0)
        .input("SellableArea",    sql.Decimal(18,4),  item.SellableArea    || 0)
        .input("TotalIncome",     sql.Decimal(18,2),  item.TotalIncome     || 0)
        .input("MixPct_ofNSA",    sql.Decimal(10,4),  item.MixPct_ofNSA    || 0)
        .input("UnitPct_ofTotal", sql.Decimal(10,4),  item.UnitPct_ofTotal || 0)
        .input("UserID",          sql.NVarChar(65),   req.authUser.username)
        .execute("LandDevFeasibility_UnitMixRows_Save");
    }

  } catch (error) {
    throw error;
  }
};
// end of landDevFeasibility_UnitMixRow_Save

const landDevFeasibility_CostItem_Save = async (data, landID,organizationId, totalCost, currency, currencyRate, req, transaction) => {
  try {
    for (let i = 0; i < data.length; i++) {
        const item =  data[i];
        const request = new sql.Request(transaction);
        await request
        .input("ID2",            sql.NVarChar(65),   item.ID2             || null)
        .input("LandID",         sql.NVarChar(65),   landID)
        .input("OrganizationId", sql.NVarChar(65),   organizationId)
        .input("TenantId",       sql.NVarChar(65),   req.authUser.tenantId)
        .input("Currency",       sql.NVarChar(10),   currency)
        .input("CurrencyRate",   sql.Decimal(18,6),  currencyRate)
        .input("TotalCost",      sql.Decimal(18,2),  totalCost            || 0)
        .input("SortOrder",      sql.Int,            i + 1)
        .input("Classification", sql.NVarChar(150),  cleanStr(item.Classification))
        .input("Component",      sql.NVarChar(250),  cleanStr(item.Component))
        .input("CostType",       sql.NVarChar(20),   item.CostType        || "Fixed")
        .input("CostValue",      sql.Decimal(18,4),  item.Value           || 0)
        .input("PctBase",        sql.NVarChar(250),  item.PctBase         || null)
        .input("CalculatedAmt",  sql.Decimal(18,2),  item.CalculatedAmt   || 0)
        .input("IconClass",      sql.NVarChar(100),  item.IconClass        || null)
        .input("ColorName",      sql.NVarChar(50),   item.ColorName        || null)
        .input("UserID",         sql.NVarChar(65),   req.authUser.username)
        .execute("LandDevFeasibility_CostItems_Save");
    }
  } catch (error) {
    throw error;
  }
};

// end of landDevFeasibility_CostItem_Save

const landDevFeasibility_JVPartner_Save = async (data, landID,organizationId, currency, currencyRate, req, transaction) => {
  try {
    for (let i = 0; i < data.length; i++) {
        const item =  data[i];
        const request = new sql.Request(transaction);
        await request
        .input("ID2",              sql.NVarChar(65),   item.ID2 || null)
        .input("LandID",           sql.NVarChar(65),   landID)
        .input("OrganizationId",   sql.NVarChar(65),   organizationId)
        .input("TenantId",         sql.NVarChar(65),   req.authUser.tenantId)
        .input("Currency",         sql.NVarChar(10),   currency)
        .input("CurrencyRate",     sql.Decimal(18,6),  currencyRate)
        .input("SortOrder",        sql.Int,            i + 1)
        .input("PartnerName",      sql.NVarChar(250),  cleanStr(item.PartnerName))
        .input("ContributionPct",  sql.Decimal(10,4),  item.ContributionPct  || 0)
        .input("InvestmentAmount", sql.Decimal(18,2),  item.InvestmentAmount || 0)
        .input("ProfitShare",      sql.Decimal(18,2),  item.ProfitShare      || 0)
        .input("TotalReturn",      sql.Decimal(18,2),  item.TotalReturn       || 0)
        .input("UserID",           sql.NVarChar(65),   req.authUser.username)
        .execute("LandDevFeasibility_JVPartners_Save");
    }
  } catch (error) {
    throw error;
  }
};

// end of landDevFeasibility_JVPartner_Save
  
const landDevFeasibilityGet = async (req, res) => {
    const {landId} = req.body; // user data sent from client

  let pool;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    await setTenantContext(pool, req);

    const request = new sql.Request(pool);

    const result = await request
      .input("LandID",   sql.NVarChar(65), landId)
      .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
      .execute("LandDevFeasibility_GetAll");

    // LandDevFeasibility_GetAll returns 6 result sets
    const [
      parametersRS,
      unitMixHeaderRS,
      unitMixRowsRS,
      costItemsRS,
      financialSummaryRS,
      jvPartnersRS,
    ] = result.recordsets;

    const data = {
      Parameters:       parametersRS?.[0]   || null,
      UnitMixHeader:    unitMixHeaderRS?.[0] || null,
      UnitMixRows:      unitMixRowsRS        || [],
      CostItems:        costItemsRS          || [],
      FinancialSummary: financialSummaryRS?.[0] || null,
      JVPartners:       jvPartnersRS         || [],
    };

    // return res.status(200).json({
    //   Parameters:       parametersRS?.[0]   || null,
    //   UnitMixHeader:    unitMixHeaderRS?.[0] || null,
    //   UnitMixRows:      unitMixRowsRS        || [],
    //   CostItems:        costItemsRS          || [],
    //   FinancialSummary: financialSummaryRS?.[0] || null,
    //   JVPartners:       jvPartnersRS         || [],
    // });

    res.status(200).json({
            message: `DevFeasibility data loaded successfully!`,
            data:  data
        });

  } catch (error) {
    console.error("DevFeasibility Get ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};
// end of landDevFeasibilityGet
 
const landDevFeasibilityList = async (req, res) => {
    const {organizationId} = req.body; // user data sent from client

  let pool;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    await setTenantContext(pool, req);

    const request = new sql.Request(pool);

    const result = await request
      .input("OrganizationId",   sql.NVarChar(65), organizationId)
      .input("TenantId", sql.NVarChar(65), req.authUser.tenantId)
      .execute("LandDevFeasibility_GetList");
 

    res.status(200).json({
            message: `DevFeasibility data loaded successfully!`,
            data:  result.recordset
        });

  } catch (error) {
    console.error("DevFeasibility Get ERROR:", error);
    return res.status(400).json({ message: error.message });
  }
};
// end of landDevFeasibilityList
 

const getLandsList = async (req, res) => {  
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
                            .execute('Land_Get');
 
        
        res.status(200).json({
            message: `Lands List loaded successfully!`,
            data:  apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getLandsList
 

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
 
 


module.exports =  { landDevFeasibilityList, landSaveUpdate,getLandsList,landDevFeasibilityGet,landDevFeasibilitySave,getLicenseSummary} ;
