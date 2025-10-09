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

// ------------------------- LAUNDRY ITEMS -------------------------
const laundryItemSaveUpdate = async (req, res) => {
    const formData = req.body;  

    try {
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;  

        const pool = await sql.connect(config);

        await pool.request()
            .input('ID2', sql.NVarChar(65), formData.ID2 || null)
            .input('ItemName', sql.NVarChar(150), formData.ItemName)
            .input('Description', sql.NVarChar(255), formData.Description || null)
            .input('IsActive', sql.Bit, formData.IsActive ?? true)
            .input('User', sql.NVarChar(100), formData.User || null)
            .execute('LaundryItems_SaveOrUpdate');

        res.status(200).json({ message: 'Laundry item saved/updated successfully', data: null });

    } catch (error) {
        res.status(400).json({ message: error.message, data: null });
    }
};

// ------------------------- LAUNDRY SERVICES -------------------------
const laundryServiceSaveUpdate = async (req, res) => {
    const formData = req.body;  

    try {
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;  

        const pool = await sql.connect(config);

        await pool.request()
            .input('ID2', sql.NVarChar(65), formData.ID2 || null)
            .input('ServiceName', sql.NVarChar(100), formData.ServiceName)
            .input('Description', sql.NVarChar(255), formData.Description || null)
            .input('IsActive', sql.Bit, formData.IsActive ?? true)
            .input('User', sql.NVarChar(100), formData.User || null)
            .execute('LaundryServices_SaveOrUpdate');

        res.status(200).json({ message: 'Laundry service saved/updated successfully', data: null });

    } catch (error) {
        res.status(400).json({ message: error.message, data: null });
    }
};

// ------------------------- LAUNDRY ORDERS -------------------------
const laundryOrderSaveUpdate = async (req, res) => {
    const formData = req.body;  

    try {

        store.dispatch(setCurrentDatabase(formData.client));
        store.dispatch(setCurrentUser(req.authUser || 'System')); 
        const config = store.getState().constents.config;  

        const pool = await sql.connect(config);

        const customerResult = await pool.request()
            .input('ID2', sql.NVarChar(350), formData.ID2 || null) 
            .input('FullName', sql.NVarChar(255), formData.CustomerName)
            .input('DisplayName', sql.NVarChar(255), formData.CustomerName)
            .input('CompanyName', sql.NVarChar(255), formData.CustomerName) 
            .input('Phone', sql.NVarChar(50), formData.Phone)
            .input('Address', sql.NVarChar(250), formData.Address)  
            .input('Latitude', sql.NVarChar(250), formData.locationLat)  
            .input('Longitude', sql.NVarChar(250), formData.locationLang)  
            .input('MapLocation', sql.NVarChar(250), formData.locationName)  

            .output('ID', sql.NVarChar(100))
            .execute('Laundry_Customer_Save_Update');

            const customerId = customerResult.output.ID;
             
        const result = await pool.request()
            .input('ID2', sql.NVarChar(65), formData.ID2 || null)
            .input('CustomerId', sql.NVarChar(65), customerId || null)
            .input('OrderNo', sql.NVarChar(100), formData.OrderNo || null)
            .input('CustomerName', sql.NVarChar(100), formData.CustomerName)
            .input('Phone', sql.NVarChar(20), formData.Phone)
            .input('Address', sql.NVarChar(255), formData.Address || null)
            .input('UseCurrentLocation', sql.Bit, parseBoolean(formData.UseCurrentLocation) ?? false)
            .input('ExpressService', sql.Bit, parseBoolean(formData.ExpressService)  ?? false)
            .input('PickupService', sql.Bit, parseBoolean(formData.PickupService) ?? true)
            .input('TotalItems', sql.Int, formData.TotalItems || 0)
            .input('SubTotal', sql.Decimal(10,5), formData.SubTotal || 0)
            .input('VatRate', sql.Decimal(5,2), formData.VatRate || 5)
            .input('VatAmount', sql.Decimal(10,5), formData.VatAmount || 0)
            .input('ShippingCharges', sql.Decimal(10,5), formData.ShippingCharges || 0)
            .input('Status', sql.NVarChar(50), formData.Status || 'Pending')
            .input('User', sql.NVarChar(100), formData.User || null)
            .output('ID', sql.NVarChar(100))
            .execute('LaundryOrders_SaveOrUpdate');

            const newID = result.output.ID;

            if(formData.orderItems){ 
                await laundryOrderItemSaveUpdate(req,newID);  
            }

        res.status(200).json({ 
            message: 'Laundry order saved/updated successfully', 
            data: formData 
        });

    } catch (error) {
        res.status(400).json({ message: error.message, data: null });
    }
};

// ------------------------- LAUNDRY ORDER ITEMS ------------------------- 

async function laundryOrderItemSaveUpdate(req,orderId){
    const formData = req.body; 
    const orderItems = JSON.parse(formData.orderItems);   

    try {
        store.dispatch(setCurrentDatabase(formData.client));
        store.dispatch(setCurrentUser(req.authUser || 'System')); 
        const config = store.getState().constents.config;  

        const pool = await sql.connect(config);
        if (orderItems) {
            for (let item of orderItems) {  
                console.log(item);
                if(item.ItemId){ 
                await pool.request()
                    .input('ID2', sql.NVarChar(65), item.ID2 || null)
                    .input('OrderId', sql.NVarChar(65), orderId)
                    .input('ItemId', sql.NVarChar(65), item.ItemId)
                    .input('ServiceId', sql.NVarChar(65), item.ServiceId)
                    .input('Quantity', sql.Int, item.Quantity || 1)
                    .input('UnitPrice', sql.Decimal(10,5), item.UnitPrice)
                    .input('User', sql.NVarChar(100), formData.user || null)
                    .execute('LaundryOrderItems_SaveOrUpdate');
                }
            }
        }

        // res.status(200).json({ message: 'Laundry order item saved/updated successfully', data: null });

    } catch (error) { 
        throw new Error(error.message);

    }
};

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}

const laundryChangeOrderStatus = async (req, res) => {
    const formData = req.body;  

    try {

        store.dispatch(setCurrentDatabase(formData.client));
        store.dispatch(setCurrentUser(req.authUser || 'System')); 
        const config = store.getState().constents.config;  

        const pool = await sql.connect(config);

        const result = await pool.request()
            .input('ID2', sql.NVarChar(350), formData.orderId) 
            .input('OrderNo', sql.NVarChar(255), formData.orderNo)
            .input('Status', sql.NVarChar(255), formData.newStatus)
            .input('StatusID', sql.NVarChar(255), formData.newStatusId || null) 
            .input('ChangedBy', sql.NVarChar(255), formData.ChangedBy || 'System')  
            .execute('Laundry_Order_Change_Status');
 
        res.status(200).json({ 
            message: 'Laundry order status changed successfully', 
            data: result 
        });

    } catch (error) {
        res.status(400).json({ message: error.message, data: null });
    }
};

const getLaundryCustomerDetails = async (req, res) => {
    const { phone,client } = req.body;

    try {
        store.dispatch(setCurrentDatabase(client));
        store.dispatch(setCurrentUser(req.authUser || 'System'));  

        const config = store.getState().constents.config;

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('Phone', sql.NVarChar(65), phone || null)
            .execute('Laundry_Customer_Details');

        res.status(200).json({
            message: 'Laundry customer Details loaded successfully',
            data: result.recordset
        });

    } catch (error) {
        res.status(400).json({ message: error.message, data: null });
    }
};
// end of get customer details

const deleteOrderItem = async (req, res) => {
    const { id,ID2,client } = req.body;

    try {
        store.dispatch(setCurrentDatabase(client));
        store.dispatch(setCurrentUser(req.authUser || 'System'));  

        const config = store.getState().constents.config;

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('Phone', sql.NVarChar(65), phone || null)
            .execute('Laundry_Customer_Details');

        res.status(200).json({
            message: 'Laundry order item deleted  successfully',
            data: result.recordset
        });

    } catch (error) {
        res.status(400).json({ message: error.message, data: null });
    }
};
// end of deleteOrderItem


// ------------------------- LAUNDRY ITEMS -------------------------
const getLaundryItems = async (req, res) => {
    const { ID2 } = req.body;

    try {
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('ID2', sql.NVarChar(65), ID2 || null)
            .execute('LaundryItems_Get');

        res.status(200).json({
            message: 'Laundry items loaded successfully',
            data: result.recordset
        });

    } catch (error) {
        res.status(400).json({ message: error.message, data: null });
    }
};

// ------------------------- LAUNDRY SERVICES -------------------------
const getLaundryServices = async (req, res) => {
    const { ID2 } = req.body;

    try {
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('ID2', sql.NVarChar(65), ID2 || null)
            .execute('LaundryServices_Get');

        res.status(200).json({
            message: 'Laundry services loaded successfully',
            data: result.recordset
        });

    } catch (error) {
        res.status(400).json({ message: error.message, data: null });
    }
};

// ------------------------- LAUNDRY PRICE LIST -------------------------
const getLaundryPriceList = async (req, res) => {
    const { ID2, ItemId, ServiceId } = req.body;

    try {
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('ID2', sql.NVarChar(65), ID2 || null)
            .input('ItemId', sql.NVarChar(65), ItemId || null)
            .input('ServiceId', sql.NVarChar(65), ServiceId || null)
            .execute('LaundryPriceList_Get');

        res.status(200).json({
            message: 'Laundry price list loaded successfully',
            data: result.recordset
        });

    } catch (error) {
        res.status(400).json({ message: error.message, data: null });
    }
};

// ------------------------- LAUNDRY ORDERS -------------------------
const getLaundryOrders = async (req, res) => {
    const { ID2, CustomerId,isWeb, client } = req.body;

    try {
        console.log('client');
        console.log(client);

        store.dispatch(setCurrentDatabase(client));
        store.dispatch(setCurrentUser(req.authUser || 'System')); 
        const config = store.getState().constents.config;
        console.log(config);
        const pool = await sql.connect(config);

        const result = await pool.request()
            .input('ID2', sql.NVarChar(65), ID2 || null) 
            .input('isWeb', sql.Bit, isWeb ? 1 : 0 || null)  
            .execute('LaundryOrders_Get');

        res.status(200).json({
            message: 'Laundry orders loaded successfully',
            data: result.recordset
        });

    } catch (error) {
        res.status(400).json({ message: error.message, data: null });
    }
};

const getLaundryOrderDetails = async (req, res) => {
    const { ID2, CustomerId,isWeb, client } = req.body;

    try { 

        store.dispatch(setCurrentDatabase(client));
        store.dispatch(setCurrentUser(req.authUser || 'System')); 
        const config = store.getState().constents.config;
        console.log(config);
        const pool = await sql.connect(config);

        const orderResult = await pool.request()
            .input('ID2', sql.NVarChar(65), ID2 || null) 
            .input('isWeb', sql.Bit, isWeb ? 1 : 0 || null)  
            .execute('LaundryOrder_Details');


        const itemsResult = await pool.request()
            .input('OrderId', sql.NVarChar(65), ID2 || null)  
            .execute('LaundryOrderItems_Details');

         
        const data = {
            orderDetails: orderResult.recordset[0],
            orderItems: itemsResult.recordset,  
        }
            

        res.status(200).json({
            message: 'Laundry order details loaded successfully',
            data: data
        });

    } catch (error) {
        res.status(400).json({ message: error.message, data: null });
    }
};

// ------------------------- LAUNDRY ORDER ITEMS -------------------------
const getLaundryOrderItems = async (req, res) => {
    const { OrderId,client } = req.body;

    try {
        store.dispatch(setCurrentDatabase(client));
        store.dispatch(setCurrentUser(req.authUser || 'system')); 
        const config = store.getState().constents.config;

        const pool = await sql.connect(config);
        const result = await pool.request()
            .input('OrderId', sql.NVarChar(65), OrderId || null)
            .execute('LaundryOrderItems_Get');

        res.status(200).json({
            message: 'Laundry order items loaded successfully',
            data: result.recordset
        });

    } catch (error) {
        res.status(400).json({ message: error.message, data: null });
    }
};


module.exports = {
    laundryItemSaveUpdate,laundryChangeOrderStatus,  laundryServiceSaveUpdate,  laundryOrderSaveUpdate,  laundryOrderItemSaveUpdate,
    // ------
    deleteOrderItem,getLaundryCustomerDetails,getLaundryItems,  getLaundryServices,  getLaundryPriceList, getLaundryOrders,getLaundryOrderDetails,  getLaundryOrderItems

};