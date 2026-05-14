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

// ---------------- order creation

const getPool = async (req) => {
  store.dispatch(setCurrentDatabase(req.authUser.database));
  store.dispatch(setCurrentUser(req.authUser));
  const config = store.getState().constents.config;
  const pool = await sql.connect(config);
  await setTenantContext(pool, req);
  return pool;
};


const textileStock_GeneralSelection = async (req, res) => {
  let pool;
  try {
    pool = await getPool(req);
 
    const {
      organizationId,
      searchText = null,
      minPcs     = null,
      pageNumber = 1,
      pageSize   = 50,
    } = req.body;
 
    const result = await new sql.Request(pool)
      .input("TenantID",        sql.NVarChar(65),    req.authUser.tenantId || null)
      .input("OrganizationID",  sql.NVarChar(65),    organizationId        || null)
      .input("SearchText",      sql.NVarChar(200),   searchText            || null)
      .input("MinPcs",          sql.Decimal(18, 3),  minPcs                ?? null)
      .input("PageNumber",      sql.Int,             pageNumber)
      .input("PageSize",        sql.Int,             pageSize)
      .execute("usp_Stock_GeneralSelection");
 
    const items     = result.recordsets[0] ?? [];
    const totalRows = items[0]?.TotalRows  ?? 0;
 
    return res.status(200).json({
      message: "General selection loaded successfully.",
      data: {
        items,
        pagination: {
          pageNumber,
          pageSize,
          totalRows,
          totalPages: Math.ceil(totalRows / pageSize),
        },
      },
    });
  } catch (err) {
    console.error("Stock_GeneralSelection ERROR:", err);
    return res.status(400).json({ message: err.message });
  }
};
 
 
// ------------------------------------------------------------
//  1.2  Stock – Specific Selection
//       POST /api/textile/stock/specific-selection
//       Body: { organizationId, searchText?, lotNo?, designNo?,
//               colorNo?, pageNumber?, pageSize? }
// ------------------------------------------------------------
const textileStock_SpecificSelection = async (req, res) => {
  let pool;
  try {
    pool = await getPool(req);
 
    const {
      organizationId,
      searchText = null,
      lotNo      = null,
      designNo   = null,
      colorNo    = null,
      pageNumber = 1,
      pageSize   = 100,
    } = req.body;
 
    const result = await new sql.Request(pool)
      .input("TenantID",        sql.NVarChar(65),  req.authUser.tenantId || null)
      .input("OrganizationID",  sql.NVarChar(65),  organizationId        || null)
      .input("SearchText",      sql.NVarChar(200), searchText            || null)
      .input("LotNo",           sql.NVarChar(50),  lotNo                 || null)
      .input("DesignNo",        sql.NVarChar(50),  designNo              || null)
      .input("ColorNo",         sql.NVarChar(50),  colorNo               || null)
      .input("PageNumber",      sql.Int,           pageNumber)
      .input("PageSize",        sql.Int,           pageSize)
      .execute("usp_Stock_SpecificSelection");
 
    const items     = result.recordsets[0] ?? [];
    const totalRows = items[0]?.TotalRows  ?? 0;
 
    return res.status(200).json({
      message: "Specific selection loaded successfully.",
      data: {
        items,
        pagination: {
          pageNumber,
          pageSize,
          totalRows,
          totalPages: Math.ceil(totalRows / pageSize),
        },
      },
    });
  } catch (err) {
    console.error("Stock_SpecificSelection ERROR:", err);
    return res.status(400).json({ message: err.message });
  }
};
 
 
// ============================================================
//  SECTION 2 – ORDER CRUD
// ============================================================
 
// ------------------------------------------------------------
//  2.1  Order – Save (Create or Update)
//       POST /api/textile/order/save
//
//  Body (new order):  { organizationId, customerName, ...financials, items: [] }
//  Body (update):     { orderId, organizationId, customerName, ...financials, items: [] }
//
//  items[] shape:
//    { lineId?, stockInItemId?, stockInId?, itemDesc, designNo, colorNo,
//      supplierName, availPcs, availMTS, availYDS,
//      orderQtyPcs, orderQtyMTS, orderQtyYDS, unitCost, unitPrice }
// ------------------------------------------------------------
const textileOrder_Save = async (req, res) => {
  let pool;
  try {
    pool = await getPool(req);
 
    const {
      orderId          = null,
      organizationId,
      customerId       = null,
      customerName     = null,
      shippingAddress  = null,
      orderDate,
      currency         = "AED",
      subtotal         = 0,
      discountType     = null,
      discountValue    = 0,
      discountAmt      = 0,
      afterDiscount    = 0,
      vatType          = "5",
      vatRate          = 0.05,
      vatAmount        = 0,
      totalSales       = 0,
      totalCost        = 0,
      status           = "Draft",
      notes            = null,
      items            = [],
    } = req.body;
 
    // Validate required fields
    if (!organizationId) return res.status(400).json({ message: "organizationId is required." });
    if (!orderDate)      return res.status(400).json({ message: "orderDate is required." });
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ message: "items array is required and must not be empty." });
 
    // Serialise items to JSON for the stored procedure
    const itemsJSON = JSON.stringify(
      items.map((i) => ({
        LineID:        i.lineId        ?? "",
        StockInItemID: i.stockInItemId ?? "",
        StockInID:     i.stockInId     ?? "",
        ItemDesc:      i.itemDesc      ?? "",
        DesignNo:      i.designNo      ?? "",
        ColorNo:       i.colorNo       ?? "",
        SupplierName:  i.supplierName  ?? "",
        AvailPcs:      i.availPcs      ?? 0,
        AvailMTS:      i.availMTS      ?? 0,
        AvailYDS:      i.availYDS      ?? 0,
        OrderQtyPcs:   i.orderQtyPcs   ?? 0,
        OrderQtyMTS:   i.orderQtyMTS   ?? 0,
        OrderQtyYDS:   i.orderQtyYDS   ?? 0,
        UnitCost:      i.unitCost      ?? 0,
        UnitPrice:     i.unitPrice     ?? 0,
      }))
    );
 
    const request = new sql.Request(pool);
 
    // Register OUTPUT parameters
    request.output("OutOrderID", sql.NVarChar(65));
    request.output("OutMessage", sql.NVarChar(500));
 
    const result = await request
      .input("OrderID",         sql.NVarChar(65),    orderId         || null)
      .input("TenantID",        sql.NVarChar(65),    req.authUser.tenantId  || null)
      .input("OrganizationID",  sql.NVarChar(65),    organizationId)
      .input("CustomerID",      sql.NVarChar(65),    customerId      || null)
      .input("CustomerName",    sql.NVarChar(200),   customerName    || null)
      .input("ShippingAddress", sql.NVarChar(500),   shippingAddress || null)
      .input("OrderDate",       sql.Date,            new Date(orderDate))
      .input("Currency",        sql.NVarChar(10),    currency)
      .input("Subtotal",        sql.Decimal(18, 4),  subtotal)
      .input("DiscountType",    sql.NVarChar(10),    discountType    || null)
      .input("DiscountValue",   sql.Decimal(18, 4),  discountValue)
      .input("DiscountAmt",     sql.Decimal(18, 4),  discountAmt)
      .input("AfterDiscount",   sql.Decimal(18, 4),  afterDiscount)
      .input("VATType",         sql.NVarChar(20),    vatType)
      .input("VATRate",         sql.Decimal(6, 4),   vatRate)
      .input("VATAmount",       sql.Decimal(18, 4),  vatAmount)
      .input("TotalSales",      sql.Decimal(18, 4),  totalSales)
      .input("TotalCost",       sql.Decimal(18, 4),  totalCost)
      .input("Status",          sql.NVarChar(30),    status)
      .input("Notes",           sql.NVarChar(1000),  notes           || null)
      .input("ActionBy",        sql.NVarChar(100),   req.authUser.email || req.authUser.userId || null)
      .input("ItemsJSON",       sql.NVarChar(sql.MAX), itemsJSON)
      .execute("usp_Order_Save");
 
    const outOrderID = result.output.OutOrderID;
    const outMessage = result.output.OutMessage;
 
    if (!outOrderID) {
      return res.status(400).json({ message: outMessage || "Order save failed." });
    }
 
    return res.status(200).json({
      message: outMessage,
      data: { orderId: outOrderID },
    });
  } catch (err) {
    console.error("Order_Save ERROR:", err);
    return res.status(400).json({ message: err.message });
  }
};
 
 
// ------------------------------------------------------------
//  2.2  Order – Update Status
//       PATCH /api/textile/order/update-status
//       Body: { orderId, newStatus }
//       newStatus: Draft | Confirmed | DO_Created | Cancelled
// ------------------------------------------------------------
const textileOrder_UpdateStatus = async (req, res) => {
  let pool;
  try {
    pool = await getPool(req);
 
    const { orderId, newStatus } = req.body;
 
    if (!orderId)   return res.status(400).json({ message: "orderId is required." });
    if (!newStatus) return res.status(400).json({ message: "newStatus is required." });
 
    const VALID_STATUSES = ["Draft", "Confirmed", "DO_Created", "Cancelled"];
    if (!VALID_STATUSES.includes(newStatus)) {
      return res.status(400).json({
        message: `Invalid status. Allowed: ${VALID_STATUSES.join(", ")}.`,
      });
    }
 
    const request = new sql.Request(pool);
    request.output("OutMessage", sql.NVarChar(500));
 
    const result = await request
      .input("OrderID",   sql.NVarChar(65),  orderId)
      .input("TenantID",  sql.NVarChar(65),  req.authUser.tenantId || null)
      .input("NewStatus", sql.NVarChar(30),  newStatus)
      .input("ActionBy",  sql.NVarChar(100), req.authUser.email || req.authUser.userId || null)
      .execute("usp_Order_UpdateStatus");
 
    const outMessage = result.output.OutMessage;
 
    return res.status(200).json({ message: outMessage });
  } catch (err) {
    console.error("Order_UpdateStatus ERROR:", err);
    return res.status(400).json({ message: err.message });
  }
};
 
 
// ------------------------------------------------------------
//  2.3  Order – Soft Delete
//       DELETE /api/textile/order/delete
//       Body: { orderId }
// ------------------------------------------------------------
const textileOrder_Delete = async (req, res) => {
  let pool;
  try {
    pool = await getPool(req);
 
    const { orderId } = req.body;
 
    if (!orderId) return res.status(400).json({ message: "orderId is required." });
 
    const request = new sql.Request(pool);
    request.output("OutMessage", sql.NVarChar(500));
 
    const result = await request
      .input("OrderID",  sql.NVarChar(65),  orderId)
      .input("TenantID", sql.NVarChar(65),  req.authUser.tenantId || null)
      .input("ActionBy", sql.NVarChar(100), req.authUser.email || req.authUser.userId || null)
      .execute("usp_Order_Delete");
 
    const outMessage = result.output.OutMessage;
 
    return res.status(200).json({ message: outMessage });
  } catch (err) {
    console.error("Order_Delete ERROR:", err);
    return res.status(400).json({ message: err.message });
  }
};
 
 
// ------------------------------------------------------------
//  2.4  Order – Get List (paginated)
//       POST /api/textile/order/list
//       Body: { organizationId?, customerId?, status?, dateFrom?,
//               dateTo?, searchText?, pageNumber?, pageSize? }
// ------------------------------------------------------------
const textileOrder_GetList = async (req, res) => {
  let pool;
  try {
    pool = await getPool(req);
 
    const {
      organizationId = null,
      customerId     = null,
      status         = null,
      dateFrom       = null,
      dateTo         = null,
      searchText     = null,
      pageNumber     = 1,
      pageSize       = 30,
    } = req.body;
 
    const result = await new sql.Request(pool)
      .input("TenantID",       sql.NVarChar(65),  req.authUser.tenantId || null)
      .input("OrganizationID", sql.NVarChar(65),  organizationId        || null)
      .input("CustomerID",     sql.NVarChar(65),  customerId            || null)
      .input("Status",         sql.NVarChar(30),  status                || null)
      .input("DateFrom",       sql.Date,          dateFrom ? new Date(dateFrom) : null)
      .input("DateTo",         sql.Date,          dateTo   ? new Date(dateTo)   : null)
      .input("SearchText",     sql.NVarChar(200), searchText            || null)
      .input("PageNumber",     sql.Int,           pageNumber)
      .input("PageSize",       sql.Int,           pageSize)
      .execute("usp_Order_GetList");
 
    const orders    = result.recordsets[0] ?? [];
    const totalRows = orders[0]?.TotalRows ?? 0;
 
    return res.status(200).json({
      message: "Order list loaded successfully.",
      data: {
        orders,
        pagination: {
          pageNumber,
          pageSize,
          totalRows,
          totalPages: Math.ceil(totalRows / pageSize),
        },
      },
    });
  } catch (err) {
    console.error("Order_GetList ERROR:", err);
    return res.status(400).json({ message: err.message });
  }
};
 
 
// ------------------------------------------------------------
//  2.5  Order – Get By ID (header + lines)
//       POST /api/textile/order/details
//       Body: { orderId }
// ------------------------------------------------------------
const textileOrder_GetByID = async (req, res) => {
  let pool;
  try {
    pool = await getPool(req);
 
    const { orderId } = req.body;
 
    if (!orderId) return res.status(400).json({ message: "orderId is required." });
 
    const result = await new sql.Request(pool)
      .input("OrderID",  sql.NVarChar(65), orderId)
      .input("TenantID", sql.NVarChar(65), req.authUser.tenantId || null)
      .execute("usp_Order_GetByID");
 
    const header = result.recordsets[0]?.[0] ?? null;
    const items  = result.recordsets[1]       ?? [];
 
    if (!header) {
      return res.status(404).json({ message: "Order not found." });
    }
 
    return res.status(200).json({
      message: "Order details loaded successfully.",
      data: { header, items },
    });
  } catch (err) {
    console.error("Order_GetByID ERROR:", err);
    return res.status(400).json({ message: err.message });
  }
};
 
 



module.exports =  {textileStockInGetDetails, textileStockInGetList,textileStockInSaveUpdate,getTextileInventoryStockDetails,getTextileInventoryStockTransfers, getTextileInventoryStockOuts, textileStockOutSaveUpdate, textileStockTransferSaveUpdate , getPODetails,getTextileStockItems,getTextileInventoryGRNItems,
  // Stock selection
  textileStock_GeneralSelection,
  textileStock_SpecificSelection,
 
  // Order CRUD
  textileOrder_Save,
  textileOrder_UpdateStatus,
  textileOrder_Delete,
  textileOrder_GetList,
  textileOrder_GetByID,

} ;
