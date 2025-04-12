const sql = require("mssql");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config(); 
const store = require('../store'); 
const { setCurrentDatabase,setCurrentUser } = require('../constents').actions;
const fs = require("fs");
const crypto = require('crypto');
const multer = require("multer");
const { BlobServiceClient } = require("@azure/storage-blob"); 
const constentsSlice = require("../constents");


const SECRET_KEY = process.env.SECRET_KEY;

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "documents";
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

  
const salaryComponentSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                  
                
                const result = await pool.request()
                    .input('ID2', sql.NVarChar(250), formData.ID2)
                    .input('EarningType', sql.NVarChar(100), formData.earningType)
                    .input('EarningName', sql.NVarChar(255), formData.earningName)
                    .input('NameInPayslip', sql.NVarChar(255), formData.nameInPayslip)
                    .input('CalculationType', sql.NVarChar(50), formData.calculationType)
                    .input('Amount', sql.Decimal(18, 2), formData.amount|| 0)
                    .input('Percentage', sql.Decimal(5, 2), formData.percentage||0)
                    .input('ProRata', sql.Bit, formData.proRata ? 1 : 0)
                    .input('IsActive', sql.Bit, formData.isActive ? 1: 0)
                    .input('createdBy', sql.NVarChar(250), formData.createdBy || "Admin")  
                    .output('NewID', sql.NVarChar(255))  
                    .execute('PayRollEarnings_Save_Update');    
 
                res.status(200).json({
                    message: 'Salary Component saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of salaryComponentSaveUpdate
 
function encryptID(id) {
  
    const secretKey = process.env.ENCRYPT_SECRET_KEY;   
    const iv = crypto.randomBytes(16);  
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(secretKey, 'utf-8'), iv);

    let encrypted = cipher.update(id.toString(), 'utf-8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + encrypted; // Return IV + Encrypted Data
}
// end of encryptID
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
 
const getSalaryComponentList = async (req, res) => {  
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec PayRollEarnings_Get`; 
        const apiResponse = await pool.request().query(query); 
        const formatCreatedAt = (createdAt) => {
            const date = new Date(createdAt);
            return date.toLocaleDateString("en-US");
        };
        
        let formatedData = apiResponse.recordset.map(staff => ({
            ...staff
            // CreatedAt: formatCreatedAt(staff.CreatedAt),
            // ChangedAt: formatCreatedAt(staff.ChangedAt), 
        })); 
        formatedData = formatedData.map(({ ID, ...rest }) => rest);

        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Salary Components List loaded successfully!`,
            data: formatedData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getSalaryComponentList
const getSalaryComponentDetails = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec PayRollEarnings_Get '${Id}'`; 
        const apiResponse = await pool.request().query(query);  
         
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset[0]; 
        }  
        res.status(200).json({
            message: `salary component details loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getSalaryComponentDetails

// ----------------- end of salary component section

const salaryComponentBenefitSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try { 
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                   
                const result = await pool.request()
                    .input('ID2', sql.NVarChar(250), formData.ID2)
                    .input('benefitPlan', sql.NVarChar(250), formData.benefitPlan)
                    .input('nameInPayslip', sql.NVarChar(255), formData.nameInPayslip)  
                    .input('calculationType', sql.NVarChar(255), formData.calculationType)  
                    .input('amount', sql.Decimal(18, 3), formData.amount||0)  
                    .input('percentage', sql.Decimal(18, 3), formData.percentage||0)  
                    .input('effectedPeriod', sql.Int, formData.effectedPeriod)   
                    .input('IsActive', sql.Bit, formData.isActive ? 1: 0)
                    .input('createdBy', sql.NVarChar(250), formData.createdBy || "Admin")  
                    .output('NewID', sql.NVarChar(255))  
                    .execute('PayRollBenefit_Save_Update');    
 
                res.status(200).json({
                    message: 'Salary Component Benefit saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of salaryComponentBenefitSaveUpdate

const getSalaryComponentBenefitsList = async (req, res) => {  
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec PayRollBenefits_Get`; 
        const apiResponse = await pool.request().query(query); 
        const formatCreatedAt = (createdAt) => {
            const date = new Date(createdAt);
            return date.toLocaleDateString("en-US");
        };
        
        let formatedData = apiResponse.recordset.map(staff => ({
            ...staff
            // CreatedAt: formatCreatedAt(staff.CreatedAt),
            // ChangedAt: formatCreatedAt(staff.ChangedAt), 
        })); 
        formatedData = formatedData.map(({ ID, ...rest }) => rest);

        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Salary Components benefits List loaded successfully!`,
            data: formatedData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getSalaryComponentBenefitsList
const getSalaryComponentBenefitDetails = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec PayRollBenefits_Get '${Id}'`; 
        const apiResponse = await pool.request().query(query);  
         
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset[0]; 
        }  
        res.status(200).json({
            message: `salary component benfit details loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getSalaryComponentBenefitDetails

// ----------------- end of Benefits  section

const salaryComponentDeductionSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try { 
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                   
                const result = await pool.request()
                    .input('ID2', sql.NVarChar(250), formData.ID2)
                    .input('frequency', sql.NVarChar(250), formData.frequency)
                    .input('nameInPayslip', sql.NVarChar(255), formData.nameInPayslip)  
                    .input('IsActive', sql.Bit, formData.isActive ? 1: 0)
                    .input('createdBy', sql.NVarChar(250), formData.createdBy || "Admin")  
                    .output('NewID', sql.NVarChar(255))  
                    .execute('PayRollDeduction_Save_Update');    
 
                res.status(200).json({
                    message: 'Salary Component Deduction saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of salaryComponentDeductionSaveUpdate

const getSalaryComponentDeductionsList = async (req, res) => {  
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec PayRollDeductions_Get`; 
        const apiResponse = await pool.request().query(query); 
        const formatCreatedAt = (createdAt) => {
            const date = new Date(createdAt);
            return date.toLocaleDateString("en-US");
        };
        
        let formatedData = apiResponse.recordset.map(staff => ({
            ...staff
            // CreatedAt: formatCreatedAt(staff.CreatedAt),
            // ChangedAt: formatCreatedAt(staff.ChangedAt), 
        })); 
        formatedData = formatedData.map(({ ID, ...rest }) => rest);

        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Salary Components  Deductions List loaded successfully!`,
            data: formatedData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getSalaryComponentDeductionsList
const getSalaryComponentDeductionDetails = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec PayRollDeductions_Get '${Id}'`; 
        const apiResponse = await pool.request().query(query);  
         
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset[0]; 
        }  
        res.status(200).json({
            message: `salary component Deductions details loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getSalaryComponentDeductionDetails

// ----------------- end of Deduction  section

const getPayrollSummary = async (req, res) => {  
    const {payDate} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec Get_PayrollOutput '${payDate}'`; 
        const apiResponse = await pool.request().query(query);  
         
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset; 
        }  
        res.status(200).json({
            message: `Payroll summary loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPayrollSummary

const getPayrollPreview = async (req, res) => {  
    const {Id,isDraft,isAccrual} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        let query = null;
        if(isAccrual){
            query = `exec Get_Accrual_PayrollOutput_New '${Id}', 1`; 
        }else if(isDraft){
            query = `exec Get_PayrollOutput '${Id}'`;  
        }
        else{
            query = `exec Get_Accrual_PayrollOutput_New '${Id}', 0`; 
        }
         
        const apiResponse = await pool.request().query(query);  
         // Calculate totals
        let totalEmployees = 0;
        let totalPaidDaysTotalEarnings = 0;
        let totalBenefits = 0;
        let totalNetTotal = 0;

        

        let letResponseData = {};
        let payrollSummary = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset; 
            letResponseData.forEach(employee => {
                totalPaidDaysTotalEarnings += parseFloat(String(employee.PaidDaysTotalEarnings).replace(/,/g, ''));
                totalBenefits += parseFloat(String(employee.TotalBenefits).replace(/,/g, ''));
                totalNetTotal += parseFloat(String(employee.NetTotal).replace(/,/g, ''));
            });
            totalEmployees = letResponseData.length;
            payrollSummary = {
                totalEmployees:totalEmployees,
                totalPaidDaysTotalEarnings:totalPaidDaysTotalEarnings,
                totalBenefits:totalBenefits,
                totalNetTotal:totalNetTotal
            }
        }  
        res.status(200).json({
            message: `Payroll summary loaded successfully!`,
            data: {
                payrollPreview:letResponseData,
                payrollSummary:payrollSummary
            } 
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPayrollPreview
const getPayrollAccrualPreview = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec Get_Accrual_PayrollOutput_New '${Id}', 1`; 
        const apiResponse = await pool.request().query(query);  
         // Calculate totals
        let totalEmployees = 0;
        let totalPaidDaysTotalEarnings = 0;
        let totalBenefits = 0;
        let totalNetTotal = 0;

        

        let letResponseData = {};
        let payrollSummary = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset; 
            letResponseData.forEach(employee => {
                totalPaidDaysTotalEarnings += parseFloat(String(employee.PaidDaysTotalEarnings).replace(/,/g, ''));
                totalBenefits += parseFloat(String(employee.TotalBenefits).replace(/,/g, ''));
                totalNetTotal += parseFloat(String(employee.NetTotal).replace(/,/g, ''));
            });
            totalEmployees = letResponseData.length;
            payrollSummary = {
                totalEmployees:totalEmployees,
                totalPaidDaysTotalEarnings:totalPaidDaysTotalEarnings,
                totalBenefits:totalBenefits,
                totalNetTotal:totalNetTotal
            }
        }  
        res.status(200).json({
            message: `Payroll Accrual summary loaded successfully!`,
            data: {
                payrollPreview:letResponseData,
                payrollSummary:payrollSummary
            } 
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPayrollAccrualPreview


 

module.exports =  {getPayrollAccrualPreview,getPayrollPreview,getPayrollSummary,getSalaryComponentDeductionDetails,getSalaryComponentDeductionsList,salaryComponentDeductionSaveUpdate,getSalaryComponentBenefitDetails,getSalaryComponentBenefitsList,salaryComponentBenefitSaveUpdate,salaryComponentSaveUpdate,getSalaryComponentList,getSalaryComponentDetails} ;
