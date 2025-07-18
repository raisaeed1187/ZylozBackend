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

  
const coaSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            console.log('formData');
            console.log(formData);

            const pool = await sql.connect(config);
            try {  
                const request = pool.request();
                request.input("AccountCode", sql.NVarChar(100), String(formData.accountCode));
                request.input("ParentAccountCode", sql.NVarChar(100), String(formData.parentAccountCode));
                request.input("Name", sql.NVarChar(100), formData.name || formData.category || "");
                request.input("Description", sql.NVarChar(255), formData.description || "");
                request.input("AccountType", sql.NVarChar(50), formData.accountType || "");
                request.input("AccountGroup", sql.NVarChar(50), formData.accountGroup || "");
                request.input("AccountSubGroup", sql.NVarChar(50), formData.accountSubGroup || "");
                request.input("Value", sql.Decimal(18, 2), formData.value || 0);
                request.input("ChangePercentage", sql.Decimal(5, 2), formData.change || 0);
                request.input("CreatedBy", sql.NVarChar(100), formData.userName || 'Admin'); // replace with real user
                request.input("IsActive", sql.Bit, formData.active !== false); 
                await request.execute("ChartOfAccount_SaveOrUpdate_NEW");
 
                res.status(200).json({
                    message: 'COA saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of coaSaveUpdate

const coaSaveUpdateNew = async (req,res)=>{
    const formData = req.body;
    // const accounts = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  
            
            const accounts = JSON.parse(formData.accounts);

            console.log('accounts');
            console.log(accounts);
 

            const pool = await sql.connect(config);
            try { 

                const saveRecursive = async (
                    items,
                    parentCode = null,
                    accountType = "",
                    accountGroup = "",
                    accountSubGroup = ""
                    ) => {
                        for (const item of items) {
                            const accountCode = item.id || null;

                            const request = pool.request();
                            request.input("AccountCode", sql.NVarChar(100), String(accountCode));
                            request.input("ParentAccountCode", sql.NVarChar(100), String(parentCode));
                            request.input("Name", sql.NVarChar(100), item.name || item.category || "");
                            request.input("Description", sql.NVarChar(255), item.description || "");
                            request.input("AccountType", sql.NVarChar(50), accountType);
                            request.input("AccountGroup", sql.NVarChar(50), accountGroup);
                            request.input("AccountSubGroup", sql.NVarChar(50), accountSubGroup);
                            request.input("Value", sql.Decimal(18, 2), item.value || 0);
                            request.input("ChangePercentage", sql.Decimal(5, 2), item.change || 0);
                            request.input("CreatedBy", sql.NVarChar(100), "admin"); // replace with real user
                            request.input("IsActive", sql.Bit, item.active !== false);

                            await request.execute("ChartOfAccount_SaveOrUpdate_NEW");

                            if (item.accounts && item.accounts.length > 0) {
                            // Pass current item's accountType/group/subGroup down or fallback to previous value
                            const nextAccountType = item.accountType || accountType;
                            const nextGroup = item.accountGroup || accountGroup;
                            const nextSubGroup = item.accountSubGroup || accountSubGroup;

                            await saveRecursive(item.accounts, accountCode, nextAccountType, nextGroup, nextSubGroup);
                            }
                        }
                    };


                await saveRecursive(accounts);
                 
                res.status(200).json({
                    message: 'COA saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of coaSaveUpdateNew

 
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
 
const getCOAList = async (req, res) => {  
    const {isDetailsView} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
        
        if(isDetailsView){
            query = `exec GetChartOfAccountsDetailsView`; 
        }else{
            query = `exec ChartOfAccount_GetAll`; 
        }
        const apiResponse = await pool.request().query(query); 
        const formatCreatedAt = (createdAt) => {
            const date = new Date(createdAt);
            return date.toLocaleDateString("en-US");
        };
        
        // let formatedData = apiResponse.recordset.map(staff => ({
        //     ...staff,
        //     CreatedAt: formatCreatedAt(staff.CreatedAt || staff.createdAt),
        //     ChangedAt: formatCreatedAt(staff.ChangedAt || staff.changedAt), 
        // })); 
        // formatedData = formatedData.map(({ ID, ...rest }) => rest);

        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `COAs List loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCOAList
 

const getCOAListNew = async (req, res) => {
  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;
    const pool = await sql.connect(config);

    const result = await pool.request().execute("ChartOfAccount_GetAll");
    const rows = result.recordset;

    // Step 1: Clean and normalize
    const accountsFlat = rows.map(row => ({
      ...row,
      AccountCode: row.AccountCode?.toString() || null,
      ParentAccountCode:
        row.ParentAccountCode === null || row.ParentAccountCode === 'null'
          ? null
          : row.ParentAccountCode.toString(),
    }));

    // Step 2: Build map for quick lookup
    const map = {};
    accountsFlat.forEach(row => {
      map[row.AccountCode] = {
        id: row.AccountCode,
        name: row.Name,
        description: row.Description,
        value: row.Value,
        changePercentage: row.ChangePercentage,
        isActive: row.IsActive,
        accountType: row.AccountType,
        accountGroup: row.AccountGroup,
        accountSubGroup: row.AccountSubGroup,
        accounts: []
      };
    });

    // Step 3: Link children to parents
    const roots = [];
    accountsFlat.forEach(row => {
      const item = map[row.AccountCode];
      if (row.ParentAccountCode && map[row.ParentAccountCode]) {
        map[row.ParentAccountCode].accounts.push(item);
      } else {
        roots.push(item); // top-level nodes
      }
    });

    return res.status(200).json({
      message: "Chart of Account loaded successfully",
      data: roots
    });

  } catch (error) {
    console.error("COA Load Error", error);
    return res.status(400).json({
      message: error.message,
      data: null
    });
  }
};




// end of getCOAListNew


const getCOADetails = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec ChartOfAccount_GetDetails '${Id}'`; 
        const apiResponse = await pool.request().query(query); 
       
         
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset[0];
             
        }  
        res.status(200).json({
            message: `COA details loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCOADetails


const deleteCOAAccount = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec ChartOfAccount_Delete '${Id}'`; 
        const apiResponse = await pool.request().query(query); 
       
         
        res.status(200).json({
            message: `COA Account Deleted successfully!`,
            data: null
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of deleteCOAAccount

const deleteCustomerContact = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec DeleteCustomerContact '${Id}'`; 
        const apiResponse = await pool.request().query(query); 
       
        // const contactsQuery = `exec GetCustomerContactsList '${Id}'`; 
        // const contactsQueryResponse = await pool.request().query(contactsQuery); 
         
        res.status(200).json({
            message: `Customer Contact Deleted successfully!`,
            data: null
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of deleteCustomerContact
const getCOAAcountTypes = async (req, res) => {  
    
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec GetCOAAccountTypes`; 
        const apiResponse = await pool.request().query(query); 
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset;
        }  
        res.status(200).json({
            message: `COA Account types loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCOAAcountTypes


module.exports =  {deleteCOAAccount,getCOAAcountTypes, deleteCustomerContact,coaSaveUpdateNew,coaSaveUpdate,getCOAListNew,getCOAList,getCOADetails} ;
