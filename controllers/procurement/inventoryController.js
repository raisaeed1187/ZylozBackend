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
const stockOutSaveUpdate = async (req, res) => {
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

      .execute("InventoryStockOut_SaveOrUpdate");

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
        .execute("InventoryStockOutItem_SaveOrUpdate");
    }
  } catch (err) {
    throw new Error("Item Save Failed: " + err.message);
  }
}

// end of stockOutSaveUpdate


 
const stockTransferSaveUpdate = async (req, res) => {
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
      .execute("InventoryStockTransfer_SaveOrUpdate");

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
// end of stockTransferSaveUpdate
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
        .execute("InventoryStockTransferItem_SaveOrUpdate");
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

const getInventoryGRNItems = async (req, res) => {  
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
                // .execute('Inventory_GRNItem_Get');

                

      
        res.status(200).json({
            message: `PO details loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getInventoryGRNItems

const getStockItems = async (req, res) => {  
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
// end of getStockItems

const getInventoryStockOuts = async (req, res) => {  
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
                .execute('InventoryStockOut_GetAll'); 
 
        res.status(200).json({
            message: `Inventory stock outs loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getInventoryStockOut
 

const getInventoryStockTransfers = async (req, res) => {  
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
                .execute('InventoryStockTransfer_GetAll'); 
 
        res.status(200).json({
            message: `Inventory stock transfers loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getInventoryStockTransfers

const getInventoryStockDetails = async (req, res) => {  
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
            procedureName = 'InventoryStockOut_GetByID';
            inputName = 'StockOutID';
        } else if (type === 'stock-transfer') {
            procedureName = 'InventoryStockTransfer_GetByID';
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
            message: `Inventory ${type} details loaded successfully!`,
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



module.exports =  {getInventoryStockDetails,getInventoryStockTransfers, getInventoryStockOuts, stockOutSaveUpdate, stockTransferSaveUpdate , getPODetails,getStockItems,getInventoryGRNItems} ;
