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
 
  
const poSaveUpdate = async (req,res)=>{
    const formData = req.body; 
    
    let pool;
    let transaction;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData); 
              
            pool = await sql.connect(config);
            transaction = new sql.Transaction(pool);

            await transaction.begin();

            const request = new sql.Request(transaction);
             
            let result = await request
            .input('ID2', sql.NVarChar(65), formData.ID2)
            .input('PoType', sql.NVarChar(65), formData.poType)
            .input('PoCode', sql.NVarChar(50), formData.poCode)
            .input('Vendor', sql.NVarChar(200), formData.vendorId)
            .input('ContactPerson', sql.NVarChar(100), formData.contactPerson)
            .input('PoDate', sql.Date, formData.poDate)
            .input('PaymentTerm', sql.NVarChar(100), formData.paymentTerm)
            .input('Description', sql.NVarChar(sql.MAX), formData.description)
            .input('StatusId', sql.Int, formData.statusId)
            .input('TotalItems', sql.NVarChar(100), formData.totalItems)
            .input('TotalAmount', sql.NVarChar(100), formData.totalAmount)
            .input('CreatedBy', sql.NVarChar(100), formData.createdBy)
            .input('OrganizationId', sql.NVarChar(100), formData.organizationId)
            .input('RFQID', sql.NVarChar(100), formData.rfqId) 
            .input('TermsConditions', sql.NVarChar(sql.MAX), formData.termsConditions) 
            .input('DeliveryDate', sql.NVarChar(100), formData.deliveryDate) 
            .input('DeliveryLocation', sql.NVarChar(100), formData.deliveryLocation) 

            .output('ID', sql.NVarChar(100))  
            .execute('PurchaseOrder_SaveOrUpdate');

            const newID = result.output.ID;
            if(formData.poItems){ 
                poItemSaveUpdate(req,newID,transaction)
            }
            console.log('before email sent status 6');
            if (formData.statusId == 6) {
                console.log('inside status 6');

                query = `exec PurchaseOrder_Get '${formData.ID2}'`;  
                const poDetailsRequest = new sql.Request(transaction);

                const apiResponse = await poDetailsRequest.query(query); 
                console.log('after PO details call');
                 
                if (apiResponse.recordset.length === 0) {
                  return  res.status(400).json({ message: 'Invalid PO',data:null}); 
                }

                const po = apiResponse.recordset[0];
                console.log(po);

                const pdfBuffer = Buffer.from(formData.pdfBase64, 'base64');
 
                const attachments = [
                    {
                        filename: `${formData.poCode || ' PO'}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf',
                    },
                ];
                const text = `Please find attached the PO.`;
                const html = await getPOSentTemplate(po,formData.baseUrl ||'');
                // const html = '<h5>Please find the attached PO </h5>';
                console.log('before email sent');
                const vendorEmail = formData.vendorEmail;
                // const vendorEmail = 'raisaeedanwar1187@gmail.com';
                
                await sendEmail(
                    vendorEmail,
                    `${formData.poCode}`,
                    text,
                    html,
                    attachments
                );  
                console.log('email has sent');

            }

            await transaction.commit();
            console.log("Transaction COMMITTED!");

            res.status(200).json({
                message: 'po saved/updated',
                data: '' //result
            });
           
             
        } catch (err) {
            console.error("RFQ SAVE ERROR:", err);

            // Rollback transaction on any error
            if (transaction) {
                try {
                    await transaction.rollback();
                    console.log("Transaction ROLLED BACK!");
                } catch (rollbackErr) {
                    console.error("Rollback failed:", rollbackErr);
                }
            }

            res.status(400).json({
                message: err.message,
                data: null
            });
        }
}
// end of poSaveUpdate
 
async function poItemSaveUpdate(req,poId,transaction){
    const formData = req.body; 
    const poItems = JSON.parse(formData.poItems); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            
            try { 
                if (poItems) {
                    for (let item of poItems) {  
                        if(item.itemName){
                            const poItemRequest = new sql.Request(transaction);

                            console.log('item');
                            console.log(item);

                            await poItemRequest
                                .input('ID2', sql.NVarChar(65), item.ID2)
                                .input('ItemId', sql.NVarChar(65), item.itemId || null)
                                .input('PrId', sql.NVarChar(65), item.prId || null)
                                .input('PoId', sql.NVarChar(65), poId) 
                                .input('ItemCode', sql.NVarChar(100), item.itemCode || null)
                                .input('ItemName', sql.NVarChar(200), item.itemName)
                                .input('ItemType', sql.NVarChar(100), item.itemType || null)
                                .input('ItemUnit', sql.NVarChar(50), item.itemUnit)
                                .input('Qty', sql.NVarChar(100), String(item.qty))
                                .input('UnitCost', sql.NVarChar(100), String(item.unitCost))
                                .input('VatId', sql.NVarChar(100), String(item.vatId))
                                .input('Vat', sql.NVarChar(100), String(item.vat)) 
                                .input('Total', sql.NVarChar(100), String(item.total))
                                .input('DeliveryLocation', sql.NVarChar(500), item.deliveryLocation)
                                .input('DeliveryDate', sql.NVarChar(100), item.deliveryDate)

                                .execute('PurchaseOrderItem_SaveOrUpdate');
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
// end of poItemSaveUpdate

 
 
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
                .execute('Inventory_GRNItem_Get');

      
        res.status(200).json({
            message: `PO details loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getInventoryGRNItems

 


module.exports =  {poSaveUpdate,getPODetails,getInventoryGRNItems} ;
