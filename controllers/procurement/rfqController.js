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

const { sendEmail } = require('../../services/mailer');

const { getRfqTemplate,getRfqTemplateNew } = require('../../utils/rfqEmailTemplate');
const { getRfqSubmittedTemplate } = require('../../utils/rfqSubmittedTemplate');
const { helper } = require("../../helper");
const { setTenantContext } = require("../../helper/db/sqlTenant");
 
const SECRET_KEY = process.env.SECRET_KEY;

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "documents";
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
 
  
const rfqSaveUpdate = async (req, res) => {
    const formData = req.body;

    let pool;
    let transaction;

    try {
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser));
        const config = store.getState().constents.config;

        pool = await sql.connect(config);
        transaction = new sql.Transaction(pool);
        await setTenantContext(pool,req);

        console.log("Starting SQL Transaction...");
        await transaction.begin();

        const request = new sql.Request(transaction);
 
        let rfqResult = await request
            .input('ID2', sql.NVarChar(65), formData.ID2)
            .input('RFQCode', sql.NVarChar(50), formData.rfqCode)
            .input('ContactPerson', sql.NVarChar(100), formData.contactPerson)
            .input('RFQDate', sql.Date, formData.rfqDate)
            .input('PaymentTerm', sql.NVarChar(100), formData.paymentTerm)
            .input('Description', sql.NVarChar(sql.MAX), formData.description)
            .input('TermsConditions', sql.NVarChar(sql.MAX), formData.termsConditions)
            .input('StatusId', sql.Int, formData.statusId)
            .input('TotalItems', sql.NVarChar(100), formData.totalItems)
            .input('TotalAmount', sql.NVarChar(100), formData.totalAmount)
            .input('CreatedBy', sql.NVarChar(100), req.authUser.username)
            .input('OrganizationId', sql.NVarChar(255), formData.organizationId)
            .input('BranchId', sql.NVarChar(255), formData.branchId)
            .input('DeliveryDate', sql.NVarChar(100), formData.deliveryDate || null) 
            .input('DeliveryLocation', sql.NVarChar(100), formData.deliveryLocation || null) 
            .input('OrderNo', sql.NVarChar(100), formData.orderNo || null) 
            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
            
            .output('ID', sql.NVarChar(100))
            .execute('RFQ_SaveOrUpdate');

        const newRFQID2 = rfqResult.output.ID;
        console.log("RFQ Saved With ID2:", newRFQID2);
 
        //  start item save
        const items = JSON.parse(formData.poItems || "[]");

        for (let item of items) {
            const itemRequest = new sql.Request(transaction);

            let itemResult = await itemRequest
                .input('ID2', sql.NVarChar(65), item.ID2 || "0")
                .input('ItemId', sql.NVarChar(65), item.itemId || "")
                .input('RFQId', sql.NVarChar(65), newRFQID2)
                .input('ItemName', sql.NVarChar(200), item.item || "")
                .input('ItemUnit', sql.NVarChar(50), item.unit || "")
                .input('Qty', sql.NVarChar(100), String(item.qty))
                .input('UnitPrice', sql.NVarChar(100), String(item.unitPrice))
                .input('VatID', sql.NVarChar(65), String(item.taxId))
                .input('Vat', sql.NVarChar(65), String(item.tax))
                .input('Total', sql.NVarChar(100), String(item.amount))
                .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
                
                .output('ID', sql.NVarChar(100))
                .execute('RFQItem_SaveOrUpdate');

            const rfqItemID2 = itemResult.output.ID;
            console.log("Item saved ID2:", rfqItemID2);
 
            
            if (item.vendors && item.vendors.length > 0) {
                for (const vendor of item.vendors) { 


                    const vendorRequest = new sql.Request(transaction);

                    let vendorResult = await vendorRequest
                        .input('RFQItemId', sql.NVarChar(65), rfqItemID2)
                        .input('VendorId', sql.NVarChar(65), vendor.id)
                        .input('UnitPrice', sql.Decimal(18, 5), vendor.value)
                        .input('IsSelected', sql.Bit, vendor.id === item.selectedVendorId ? 1 : 0)
                        .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
                        
                        .output('ID2', sql.NVarChar(65))
                        .execute('RFQItemVendor_SaveOrUpdate');
 
                        
                    if (formData.statusId == 12 || formData.statusId == 15) { 
                        const rfqInfoRequest = new sql.Request(transaction);
                       
                        let rfqResponse = await rfqInfoRequest
                        .input('ID2', sql.NVarChar(65), newRFQID2)
                        .input('OrganizationId', sql.NVarChar(65), null)
                        .input('VendorId', sql.NVarChar(65), vendor.id) 
                        .execute('RFQ_Get');

                        console.log('before email sent');  
                        if (rfqResponse.recordset.length > 0) {  
                            let vendorName = vendor.name,
                            companyName = rfqResponse.recordset[0].company,
                            rfqNumber = rfqResponse.recordset[0].rfqCode,
                            rfqDate = rfqResponse.recordset[0].rfqDate, 
                            vendorId = vendor.id,

                            dueDate = "2025-11-25",
                            deliveryDate = rfqResponse.recordset[0].deliveryDate,
                            deliveryLocation = rfqResponse.recordset[0].deliveryLocation,

                            message = "",
                            vendorEmail = rfqResponse.recordset[0].vendorEmail; 
                            // vendorEmail = 'raisaeedanwar1187@gmail.com'; 


                            if (isValidEmail(vendorEmail)) { 
                                if (formData.statusId == 15 && vendor.isCurrentSubmittedVendor == 1) {
                                    const text = `AllBiz - Quotation Submitted Successfully!`;
                                    const html = await getRfqSubmittedTemplate(vendorName,vendorEmail,vendorId,newRFQID2, companyName,rfqNumber,rfqDate,dueDate,deliveryDate,deliveryLocation,message,formData.baseUrl ||'');
                                    await sendEmail(
                                        vendorEmail,
                                        "AllBiz - Quotation Submitted Successfully!",
                                        text,
                                        html
                                    ); 
                                }else{
                                    if (formData.statusId == 12) {
                                        const text = `AllBiz - New Quotation Request`;
                                        const html = await getRfqTemplateNew(vendorName,vendorEmail,vendorId,newRFQID2, companyName,rfqNumber,rfqDate,dueDate,deliveryDate,deliveryLocation,message,formData.baseUrl ||'');
                                        await sendEmail(
                                            vendorEmail,
                                            "AllBiz - New Quotation Request",
                                            text,
                                            html
                                        );  
                                    }
                                }
                                
                            }else{
                                console.log(" Invalid vendor email:", vendorEmail);
                                throw new Error("Vendor email is not invalid. "+vendorEmail);
                            } 
                            
                        }
                    }   
                    console.log("Vendor saved for item:", vendorResult.output.ID2);
                }
            }
            // end of vendor item save
        }

        // start save attachements
        // if (formData.attachments && formData.attachments.length > 0) {
        //     for (const att of formData.attachments) {

        //         if (!att.fileName || !att.fileUrl) continue; // skip empty
 
        //         const attSaveReq = new sql.Request(transaction);

        //         let attSave = await attSaveReq
        //             .input('ID2', sql.NVarChar(65), att.ID2 || "0")
        //             .input('FileName', sql.NVarChar(255), att.fileName)
        //             .input('FileType', sql.NVarChar(50), att.fileType || null)
        //             .input('FileSize', sql.BigInt, att.fileSize || null)
        //             .input('FileURL', sql.NVarChar(sql.MAX), att.fileUrl)
        //             .output('ID2', sql.NVarChar(65))              // output from Attachment_SaveOrUpdate
        //             .execute('Attachment_SaveOrUpdate');

        //         const attachmentID2 = attSave.output.ID2;
        //         console.log("Attachment Saved ID2:", attachmentID2);
 
        //         const mapReq = new sql.Request(transaction);

        //         await mapReq
        //             .input('RFQId', sql.NVarChar(65), newRFQID2)
        //             .input('VendorId', sql.NVarChar(65), att.vendorId || null)
        //             .input('AttachmentId', sql.NVarChar(65), attachmentID2)
        //             .execute('RFQVendorAttachment_SaveOrUpdate');

        //         console.log("Attachment Linked to RFQ/Vendor");
        //     }
        // }
        if (formData.statusId == 10) {
            await createPOFromRFQ(req, res, newRFQID2, transaction); // pass transaction
        }
        

        await transaction.commit();
        console.log("Transaction COMMITTED!");

        res.status(200).json({
            message: "RFQ saved successfully",
            ID2: newRFQID2
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
};

// end of rfqSaveUpdate
 
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(String(email).toLowerCase());
}

async function createPOFromRFQ(req, res, rfqID2, transaction) {
    const formData = req.body;
    const vendorWiseItems = JSON.parse(formData.vendorWiseItems || "{}");

    // Loop through each vendor
    for (const vendorId in vendorWiseItems) {
        const poItems = vendorWiseItems[vendorId];
 
        const poRequest = new sql.Request(transaction);
        const poResult = await poRequest
            .input('ID2', sql.NVarChar(65), "0")
            .input('PoType', sql.NVarChar(65), "b2f172e19660125238ab9c8704f58c5347cd83305845304c1af4de745a8a7ce49")
            .input('PoCode', sql.NVarChar(50), "")  
            .input('Vendor', sql.NVarChar(200), vendorId || "")
            .input('ContactPerson', sql.NVarChar(100), formData.contactPerson || "")
            .input('PoDate', sql.Date, new Date())
            .input('PaymentTerm', sql.NVarChar(100), formData.paymentTerm || "")
            .input('Description', sql.NVarChar(sql.MAX), formData.description || "")
            .input('StatusId', sql.Int, 1)
            .input('TotalItems', sql.NVarChar(100), String(poItems.length))
            .input('TotalAmount', sql.NVarChar(100), String(poItems.reduce((sum, i) => sum + Number(i.amount || 0), 0)) )
            .input('CreatedBy', sql.NVarChar(100), req.authUser.username)
            .input('OrganizationId', sql.NVarChar(255), formData.organizationId)
            .input('BranchId', sql.NVarChar(255), formData.branchId)
            .input('RFQID', sql.NVarChar(100), rfqID2)
            .input('TermsConditions', sql.NVarChar(sql.MAX), formData.termsConditions)
            .input('DeliveryDate', sql.NVarChar(100), formData.deliveryDate || null) 
            .input('DeliveryLocation', sql.NVarChar(100), formData.deliveryLocation || null) 
            .input('OrderNo', sql.NVarChar(100), formData.orderNo || null) 
            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  

            .output('ID', sql.NVarChar(100))
            .execute('PurchaseOrder_SaveOrUpdate');

        const newPOID = poResult.output.ID;
        console.log('before po');

        if (!newPOID) {
            throw new Error("PO ID not returned from PurchaseOrder_SaveOrUpdate");
        }

        // CREATE PO ITEMS
        for (const item of poItems) {
            console.log('inside po item');
            console.log(item);

            const poItemRequest = new sql.Request(transaction);
            await poItemRequest
                .input('ID2', sql.NVarChar(65), "0")
                .input('ItemId', sql.NVarChar(65), item.itemId || null)
                .input('PrId', sql.NVarChar(65), null)
                .input('PoId', sql.NVarChar(65), newPOID)
                .input('ItemCode', sql.NVarChar(100), "")
                .input('ItemName', sql.NVarChar(200), item.item || "")
                .input('ItemType', sql.NVarChar(100), "")
                .input('ItemUnit', sql.NVarChar(50), item.unit || "")
                .input('Qty', sql.NVarChar(100), String(item.qty))
                .input('UnitCost', sql.NVarChar(100), String(item.unitPrice))
                .input('VatId', sql.NVarChar(100), String(item.taxId))
                .input('Vat', sql.Int, item.tax)
                .input('Total', sql.NVarChar(100), String(item.amount))
                .input('DeliveryLocation', sql.NVarChar(200), "")
                .input('DeliveryDate', sql.NVarChar(200), null)
                .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  

                .execute('PurchaseOrderItem_SaveOrUpdate');
        }
    }
}


// end createPOFromRFQ; 

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
 
const getRFQDetails = async (req, res) => {
  const { Id,vendorId } = req.body;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    const pool = await sql.connect(config);
    await setTenantContext(pool,req);
    
     const rfqResponse = await pool.request()
        .input('ID2', sql.NVarChar(65), Id)
        .input('OrganizationId', sql.NVarChar(65), null)
        .input('VendorId', sql.NVarChar(65), vendorId || null)
        .execute('RFQ_Get');

    // const rfqQuery = `EXEC RFQ_Get '${Id}'`;
    // const rfqResponse = await pool.request().query(rfqQuery);
 
    const itemsQuery = `EXEC RFQItem_Get '${Id}'`;
    const itemsResponse = await pool.request().query(itemsQuery);
    // console.log('itemsResponse'); 
    // console.log(itemsResponse);

    const vendorQuery = `EXEC RFQItemVendor_GetAll '${Id}'`;
    const vendorResponse = await pool.request().query(vendorQuery);
    // console.log('vendorResponse');
    // console.log(vendorResponse);

    const vendorRows = vendorResponse.recordset;
 
    const finalItems = itemsResponse.recordset.map((item) => {
      const vendorsForItem = vendorRows
        .filter((v) => v.rfqItemId == item.ID2)
        .map((v) => ({
          id: v.VendorId,
          name: v.VendorName,
          value: Number(v.UnitPrice || 0)
        }));

      // Find selected vendor
      const selectedVendor = vendorRows.find(
        (v) => v.rfqItemId == item.ID2 && v.isSelected == 1
      );
    //   console.log('selectedVendor');
    //   console.log(selectedVendor);

      return {
        ID2:item.ID2,
        item: item.itemName,
        qty: item.qty,
        unit: item.itemUnit,
        unitPrice: item.unitPrice, 
        tax: item.Vat,
        taxId:item.VatId,
        taxName:item.VatName, 
        amount: item.total,
        selectedVendorId: selectedVendor ? selectedVendor.VendorId : null,
        vendors: vendorsForItem
      };
    });

    console.log(finalItems);
 
    res.status(200).json({
      message: "RFQ details loaded successfully!",
      data: {
        rfqDetails: rfqResponse.recordset[0],
        rfqItems: finalItems
      }
    });

  } catch (error) {
    return res.status(400).json({ message: error.message, data: null });
  }
}; 
// end of getRFQDetails

const getPOItems = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
 
       
        const itemsQuery = `exec PurchaseItem_Get '${Id}',1`;   
        console.log('itemsQuery');
        console.log(itemsQuery);

        const itemsApiResponse = await pool.request().query(itemsQuery); 
          
        res.status(200).json({
            message: `PO details loaded successfully!`,
            data: itemsApiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPOItems


const deletePOItem = async (req, res) => {  
    const {Id, poId, prId,itemId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
 
        query = `exec PurchaseOrderItem_Delete  '${Id}','${poId}','${prId}','${itemId}'`;   
        const apiResponse = await pool.request().query(query); 
         
           
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `PO item deleted loaded successfully!`,
            data: ''
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of deletePOItem

const rfqChangeStatus = async (req, res) => {
  const { Id,statusId, organizationId, vendorId } = req.body;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;
    const pool = await sql.connect(config);
    await setTenantContext(pool,req);

    const request = pool.request();

    request.input("ID2", sql.NVarChar(65), Id);  
    request.input("StatusId", sql.Int, statusId || null);
    request.input("OrganizationID", sql.NVarChar(65), organizationId);
    request.input("CurrentUser", sql.NVarChar(65), req.authUser.username);

    const apiResponse = await request.execute("RFQ_Change_Status");

    res.status(200).json({
      message: "RFQ Status Changed successfully!",
      data: apiResponse.recordset
    });

  } catch (error) {
    return res.status(400).json({ message: error.message, data: null });
  }
}; 
// end of rfqChangeStatus

const getRFQsList = async (req, res) => {
  const { Id, organizationId, vendorId } = req.body;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;
    const pool = await sql.connect(config);
            await setTenantContext(pool,req);

    const request = pool.request();

    request.input("ID2", sql.NVarChar(65), null);  
    request.input("OrganizationId", sql.NVarChar(65), organizationId || null);
    request.input("VendorId", sql.NVarChar(65), vendorId || null);

    const apiResponse = await request.execute("RFQ_Get");

    res.status(200).json({
      message: "RFQs List loaded successfully!",
      data: apiResponse.recordset
    });

  } catch (error) {
    return res.status(400).json({ message: error.message, data: null });
  }
}; 
// end of getRFQsList

const getRFQPOsList = async (req, res) => {  
    const {rfqId,organizationId} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        const logoCache = {};
            await setTenantContext(pool,req);

        const result = await pool.request()
            .input('RFQID', sql.NVarChar(65), rfqId)
            .execute('GetPOsByRFQID');

        const poHeaders = result.recordsets[0];
        const poItems = result.recordsets[1];


        

        const rfqResponse = await pool.request()
        .input('ID2', sql.NVarChar(65), rfqId)
        .input('OrganizationId', sql.NVarChar(65), null)
        .input('VendorId', sql.NVarChar(65), null)
        .execute('RFQ_Get');

        let rfqDetails =  null;

        if (rfqResponse.recordset.length > 0) {
                rfqDetails =  rfqResponse.recordset[0];
        }
  
        let isApprover = false;

        const checkIsApproverResponse = await pool.request().query(`exec Approval_IsUserApprover '${req.authUser.ID2}','${rfqId}','PO' `); 
            
        console.log(checkIsApproverResponse.recordset);
        if (checkIsApproverResponse.recordset.length > 0) {
            isApprover = checkIsApproverResponse.recordset[0].IsApprover;
        }

        rfqDetails = {
            ...rfqDetails,
            isApprover: isApprover
        };

        const poWithItems = await Promise.all(
            poHeaders.map(async (po) => {
                const logoBase64 = await helper.methods.urlToBase64(po.logo);
                return {
                    ...po,
                    logo: logoBase64, 
                    items: poItems.filter(i => i.PoId === po.ID2)
                };
            })
        );
            

          
        res.status(200).json({
            message: `RFQ POs loaded successfully!`, 
            data: {
                rfqDetails: rfqDetails, 
                poWithItems: poWithItems
            } 
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getRFQPOsList

const deleteRFQItem = async (req, res) => {  
    const {Id, poId, rfqId,vendorId} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
            await setTenantContext(pool,req);
 
        const request = pool.request();

        request.input("ID2", sql.NVarChar(65), Id || null);  
        request.input("RFQId", sql.NVarChar(65), rfqId || null);
        request.input("VendorId", sql.NVarChar(65), vendorId || null); 
        const apiResponse = await request.execute("RFQItem_Delete");
 
         
            
        res.status(200).json({
            message: `RFQ item deleted loaded successfully!`,
            data: ''
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null}); 
    }

};
// end of deleteRFQItem




module.exports =  {deleteRFQItem,getRFQPOsList,rfqSaveUpdate,rfqChangeStatus,getRFQsList,getRFQDetails,getPOItems,deletePOItem} ;
