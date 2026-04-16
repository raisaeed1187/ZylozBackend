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
const { sendEmail } = require("../../services/mailer");
const { getPOSentTemplate } = require("../../utils/poSentTemplate");
const { setTenantContext } = require("../../helper/db/sqlTenant");


const SECRET_KEY = process.env.SECRET_KEY;

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "documents";
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
 
  
 
// Save Header & Items
const textileStockOutSaveUpdate = async (req, res) => {
  const formData = req.body;

  let pool;
  let transaction;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    await setTenantContext(pool,req);

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const headerRequest = new sql.Request(transaction);

    const result = await headerRequest
      .input("ID2", sql.NVarChar(65), formData.ID2 || "0")
      .input("TransactionType", sql.NVarChar(65), formData.transactionType)
      .input("ReferenceNo", sql.NVarChar(100), formData.referenceNo)
      .input("Date", sql.Date, formData.date)
      .input("WarehouseID", sql.NVarChar(65), formData.warehouseId)
      .input("Destination", sql.NVarChar(255), formData.destination)
      .input("StatusId", sql.Int, formData.statusId)
      .input("UserName", sql.NVarChar(100), req.authUser.username)
      .input("OrganizationID", sql.NVarChar(100), formData.organizationId)
      .input("TenantID", sql.NVarChar(100), req.authUser.tenantId)

      .execute("TextileInventoryStockOut_SaveOrUpdate");

    const stockOutId = result.recordset[0]?.StockOutID;

    if (formData.items) {
      await stockOutItemSaveUpdate(req, stockOutId, transaction);
    }

    await transaction.commit();
    console.log("Stock Out COMMITTED!");

    res.status(200).json({
      message: "Stock Out saved/updated successfully",
      stockOutId: stockOutId,
    });

  } catch (err) {
    console.error("Stock Out ERROR:", err);

    if (transaction) {
      await transaction.rollback();
      console.log("Stock Out ROLLED BACK!");
    }

    res.status(400).json({ message: err.message });
  }
};

async function stockOutItemSaveUpdate(req, stockOutId, transaction) {
  const formData = req.body;
//   const items = formData.items;
    const items = JSON.parse(formData.items); 

  try {
    for (const item of items) {
      if (!item.productId) continue;

      const request = new sql.Request(transaction);

      await request
        .input("ID2", sql.NVarChar(65), item.ID2 || "0")
        .input("StockOutID", sql.NVarChar(65), stockOutId)
        .input("ProductID", sql.NVarChar(65), item.productId)
        .input("QtyOut", sql.Int, item.qtyOut)
        .input("UnitPrice", sql.Decimal(18, 2), item.unitPrice)
        .input("UserName", sql.NVarChar(100), req.authUser.username)
        .input("OrganizationID", sql.NVarChar(100), formData.organizationId)
        .input("TenantID", sql.NVarChar(100), req.authUser.tenantId)
        .execute("TextileInventoryStockOutItem_SaveOrUpdate");
    }
  } catch (err) {
    throw new Error("Item Save Failed: " + err.message);
  }
}

// end of textileStockOutSaveUpdate


 
const textileStockTransferSaveUpdate = async (req, res) => {
  const formData = req.body;

  let pool;
  let transaction;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    await setTenantContext(pool, req);  

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const headerRequest = new sql.Request(transaction);

    const result = await headerRequest
      .input("ID2", sql.NVarChar(65), formData.ID2 || "0")
      .input("TransferType", sql.NVarChar(100), formData.transferType)
      .input("ReferenceNo", sql.NVarChar(100), formData.referenceNo)
      .input("Date", sql.Date, formData.date)
      .input("FromWarehouseID", sql.NVarChar(65), formData.fromWarehouseId)
      .input("ToWarehouseID", sql.NVarChar(65), formData.toWarehouseId)
      .input("Remarks", sql.NVarChar(sql.MAX), formData.remarks)
      .input("StatusId", sql.Int, formData.statusId)
      .input("OrganizationID", sql.NVarChar(100), formData.organizationId)
      .input("TenantID", sql.NVarChar(100), req.authUser.tenantId)
      .input("UserName", sql.NVarChar(100), req.authUser.username)
      .execute("TextileInventoryStockTransfer_SaveOrUpdate");

    const stockTransferId = result.recordset[0]?.StockTransferID;

    if (formData.items) {
      await stockTransferItemSaveUpdate(req, stockTransferId, transaction);
    }

    await transaction.commit();
    console.log("Stock Transfer COMMITTED!");

    res.status(200).json({
      message: "Stock Transfer saved/updated successfully",
      stockTransferId,
    });

  } catch (err) {
    console.error("Stock Transfer ERROR:", err);

    if (transaction) {
      await transaction.rollback();
      console.log("Stock Transfer ROLLED BACK!");
    }

    res.status(400).json({ message: err.message });
  }
};
// end of textileStockTransferSaveUpdate
async function stockTransferItemSaveUpdate(req, stockTransferId, transaction) {
  const formData = req.body;
  const items = JSON.parse(formData.items); 


  try {
    for (const item of items) {
      if (!item.productId) continue;

      const request = new sql.Request(transaction);

      await request
        .input("ID2", sql.NVarChar(65), item.ID2 || "0")
        .input("StockTransferID", sql.NVarChar(65), stockTransferId)
        .input("ProductID", sql.NVarChar(65), item.productId)
        .input("Qty", sql.Int, item.qtyOut) // use qtyOut same as qty in transfer
        .input("OrganizationID", sql.NVarChar(100), formData.organizationId)
        .input("TenantID", sql.NVarChar(100), req.authUser.tenantId)
        .input("UserName", sql.NVarChar(100), req.authUser.username)
        .execute("TextileInventoryStockTransferItem_SaveOrUpdate");
    }
  } catch (err) {
    throw new Error("Item Save Failed: " + err.message);
  }
}
//  end of stockTransferItemSaveUpdate
  
function encryptID(id) {
  
    const secretKey = process.env.ENCRYPT_SECRET_KEY;   
    const iv = crypto.randomBytes(16);  
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secretKey, 'utf-8'), iv);

    let encrypted = cipher.update(id.toString(), 'utf-8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + encrypted; // Return IV + Encrypted Data
}
// end of encryptID
 
const getPODetails = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
        query = `exec PurchaseOrder_Get '${Id}'`;   
        const apiResponse = await pool.request().query(query); 
         
        const itemsQuery = `exec PurchaseOrderItem_Get '${Id}'`;   
        const itemsApiResponse = await pool.request().query(itemsQuery); 
         

        const data = {
            poDetails: apiResponse.recordset[0],
            poItems: itemsApiResponse.recordset
        }
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `PO details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPODetails

const getTextileInventoryGRNItems = async (req, res) => {  
    const {Id, organizationId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';

        await setTenantContext(pool,req);
 
       
        const response = await pool.request() 
                .input('OrganizationId', sql.NVarChar(65), organizationId || null) 
                .execute('StockItem_GetAll');
                // .execute('TextileInventory_GRNItem_Get');

                

      
        res.status(200).json({
            message: `PO details loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getTextileInventoryGRNItems

const getTextileStockItems = async (req, res) => {  
    const {Id,warehouse, organizationId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';

        await setTenantContext(pool,req);
 
       
        const response = await pool.request() 
                .input('OrganizationId', sql.NVarChar(65), organizationId || null) 
                .execute('StockItem_GetAll');

      
        res.status(200).json({
            message: `Stock items loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getTextileStockItems

const getTextileInventoryStockOuts = async (req, res) => {  
    const {Id, organizationId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';

        await setTenantContext(pool,req);
  
        const response = await pool.request() 
                .input('OrganizationId', sql.NVarChar(65), organizationId || null) 
                .execute('TextileInventoryStockOut_GetAll'); 
 
        res.status(200).json({
            message: `TextileInventory stock outs loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getTextileInventoryStockOut
 

const getTextileInventoryStockTransfers = async (req, res) => {  
    const {Id, organizationId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';

        await setTenantContext(pool,req);
  
        const response = await pool.request() 
                .input('OrganizationId', sql.NVarChar(65), organizationId || null) 
                .input('TenantID', sql.NVarChar(65), req.authUser.tenantId || null) 

                .execute('TextileInventoryStockTransfer_GetAll'); 
 
        res.status(200).json({
            message: `TextileInventory stock transfers loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getTextileInventoryStockTransfers

const getTextileInventoryStockDetails = async (req, res) => {  
    const { Id, type } = req.body; // user data sent from client
      
    try {
        // Set database and user context
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  

        await setTenantContext(pool, req);

        let procedureName = '';
        let inputName = '';

        // Determine stored procedure based on type
        if (type === 'stock-out') {
            procedureName = 'TextileInventoryStockOut_GetByID';
            inputName = 'StockOutID';
        } else if (type === 'stock-transfer') {
            procedureName = 'TextileInventoryStockTransfer_GetByID';
            inputName = 'StockTransferID';
        } else {
            return res.status(400).json({ message: 'Invalid stock type', data: null });
        }

        // Execute stored procedure
        const response = await pool.request()
            .input(inputName, sql.NVarChar(65), Id || null)
            .input('TenantID', sql.NVarChar(65), req.authUser.tenantId || null)
            .execute(procedureName);

        // Extract recordsets
        const masterRecord = response.recordsets[0][0] || null; // master
        const items = response.recordsets[1] || [];             // items
        const summary = response.recordsets[2] ? response.recordsets[2][0] : null; // summary if exists

        res.status(200).json({
            message: `TextileInventory ${type} details loaded successfully!`,
            data: {
                stockDetails: masterRecord,
                items: items,
                summary: summary
            }
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};

const textileStockInSaveUpdate = async (req, res) => {
  const formData = req.body;
 
  let pool;
  let transaction;
 
  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;
 
    pool = await sql.connect(config);
   
    await setTenantContext(pool, req);
 
    transaction = new sql.Transaction(pool);
    await transaction.begin();
  
    const headerRequest = new sql.Request(transaction);
  
    const itemsArray = formData.items
      ? typeof formData.items === "string"
        ? JSON.parse(formData.items)
        : formData.items
      : [];
 
    const exchangeRate = Number(formData.exchangeRate || 3.67);
    const totalRows    = itemsArray.length;
    const totalPCS     = itemsArray.reduce((s, i) => s + Number(i.pcsNo     || 0), 0);
    const totalLenMTS  = itemsArray.reduce((s, i) => s + Number(i.lengthMts || 0), 0);
    const totalLenYDS  = itemsArray.reduce((s, i) => s + Number(i.lengthYds || 0), 0);
    const totalValUSD  = itemsArray.reduce(
      (s, i) => s + Number(i.pcsNo || 0) * Number(i.unitPrice || 0), 0
    );
    const totalValAED  = totalValUSD * exchangeRate;
    //  res.status(200).json({
    //   message:   "Stock In saved/updated successfully",
    //   stockInId: formData,
    // });

    const headerResult = await headerRequest
      .input("ID2",            sql.NVarChar(65),      formData.ID2            || null)
      .input("OrganizationID", sql.NVarChar(65),      formData.organizationId)
      .input("TenantID",       sql.NVarChar(65),      req.authUser.tenantId)
      .input("WarehouseID",    sql.NVarChar(65),      formData.warehouseId    || null)
      .input("VendorID",       sql.NVarChar(65),      formData.vendorId       || null)
      .input("PurchaseOrderID",sql.NVarChar(65),      formData.poId|| null)
      .input("ReferenceNo",    sql.NVarChar(50),      formData.reference      || null)
      .input("EntryType",      sql.NVarChar(30),      formData.entryType      || null)
      .input("EntryDate",      sql.Date,              formData.date           || null)
      .input("Notes",          sql.NVarChar(sql.MAX), formData.notes          || null)
      .input("CurrencyCode",   sql.NVarChar(10),      formData.currencyCode   || "AED")
      .input("ExchangeRate",   sql.Decimal(18, 6),    exchangeRate)
      .input("TotalRows",      sql.Int,               totalRows)
      .input("TotalPCS",       sql.Decimal(18, 3),    totalPCS)
      .input("TotalLengthMTS", sql.Decimal(18, 3),    totalLenMTS)
      .input("TotalLengthYDS", sql.Decimal(18, 3),    totalLenYDS)
      .input("TotalValueUSD",  sql.Decimal(18, 2),    totalValUSD)
      .input("TotalValueAED",  sql.Decimal(18, 2),    totalValAED)
      .input("StatusID",       sql.Int,           formData.statusId || 1)
      .input("CreatedBy",      sql.NVarChar(100),     req.authUser.username) 
      .execute("TextileStockIn_SaveUpdate");
 
    const stockInId = headerResult.recordset[0]?.ID2;
 
    if (!stockInId) {
      throw new Error("Header procedure did not return a StockIn ID.");
    }
  
    if (formData.items && itemsArray.length > 0) {
      await stockInItemsSaveUpdate(req, stockInId, transaction);
    }
 
    await transaction.commit();
    // console.log("Stock In COMMITTED — ID:", stockInId);
 
    res.status(200).json({
      message:   "Stock In saved/updated successfully",
      stockInId: stockInId,
    });
 
  } catch (err) {
    console.error("Stock In ERROR:", err);
 
    if (transaction) {
      try {
        await transaction.rollback();
        console.log("Stock In ROLLED BACK!");
      } catch (rollbackErr) {
        console.error("Rollback failed:", rollbackErr);
      }
    }
 
    res.status(400).json({ message: err.message });
  }
};
// end of textileStockInSaveUpdate

const stockInItemsSaveUpdate = async (req, stockInId, transaction) => {
  const formData = req.body;
 
  try {
    const items = typeof formData.items === "string"
      ? formData.items         // already JSON string → pass as-is
      : JSON.stringify(formData.items);
    
    const itemsRequest = new sql.Request(transaction);
  
    await itemsRequest
      .input("ID2",            sql.NVarChar(65),   null)
      .input("StockInID",      sql.NVarChar(65),   stockInId)
      .input("OrganizationID", sql.NVarChar(65),   formData.organizationId)
      .input("TenantID",       sql.NVarChar(65),   req.authUser.tenantId)
      .input("ReplaceAll",     sql.Bit,             1)
      .input("ItemsJSON",      sql.NVarChar(sql.MAX), items)
      .execute("TextileStockInItems_SaveUpdate");
  } catch (err) {
    throw new Error("Item Save Failed: " + err.message);
  } 
};
// end of stockInItemsSaveUpdate

const textileStockInGetList = async (req, res) => {
  let pool;
 
  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;
 
    pool = await sql.connect(config);
    await setTenantContext(pool, req);
 
    const {
      organizationId
    } = req.query;
 
    const request = new sql.Request(pool);
 
    const result = await request
      .input("OrganizationID",  sql.NVarChar(65),  organizationId || null)
      .input("TenantID",        sql.NVarChar(65),  req.authUser.tenantId       || null) 
      .execute("TextileStockIn_GetList");
 
    const rows       = result.recordset;
    const totalCount = rows[0]?.TotalCount ?? 0;
 
    res.status(200).json({
      data:       rows,
      totalCount: totalCount
    });
 
  } catch (err) {
    console.error("Stock In GetList ERROR:", err);
    res.status(400).json({ message: err.message });
  }
};
// end of textileStockInGetList 


const textileStockInGetDetails = async (req, res) => {
  let pool;
 
  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;
 
    pool = await sql.connect(config);
    await setTenantContext(pool, req);
 
    const { id,organizationId } = req.body;   // Stock-In ID2
 
    const request = new sql.Request(pool);

 
    const result = await request
      .input("ID2",            sql.NVarChar(65), id)
      .input("OrganizationID", sql.NVarChar(65), organizationId || null)
      .input("TenantID",       sql.NVarChar(65), req.authUser.tenantId       || null)
      .execute("TextileStockIn_GetDetails");
  
    // console.log(result.recordsets);    
    const header = result.recordsets[0]?.[0] ?? null;
    const items  = result.recordsets[1]       ?? [];
 
    if (!header) {
      return res.status(404).json({ message: "Stock In record not found." });
    }
    const data = {
            header, items 
    }
     res.status(200).json({
          message: `StockIn Details details loaded successfully!`,
          data: data
    });
  
 
  } catch (err) {
    console.error("Stock In GetDetails ERROR:", err);
    res.status(400).json({ message: err.message });
  }
};
// end of textileStockInGetDetails

module.exports =  {textileStockInGetDetails, textileStockInGetList,textileStockInSaveUpdate,getTextileInventoryStockDetails,getTextileInventoryStockTransfers, getTextileInventoryStockOuts, textileStockOutSaveUpdate, textileStockTransferSaveUpdate , getPODetails,getTextileStockItems,getTextileInventoryGRNItems} ;
