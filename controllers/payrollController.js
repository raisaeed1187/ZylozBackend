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
const getPayrollHistory = async (req, res) => {  
    const {Id,IsEOS} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        let query = ``; 

        if(IsEOS){
            query = `exec GetEOSMaster `; 
        }else {
            query = `exec GetPayrollMaster `; 
        }

        // console.log('query',query);
        
        const apiResponse = await pool.request().query(query);  
         
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset; 
        }  
        res.status(200).json({
            message: `Payroll History loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// getPayrollHistory

const payrollSave = async (req, res) => {  
    const {Id,status} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        const now = new Date(); 
        const formattedDate = getStartOfMonth(now); 
        // const query = `exec Save_PayrollOutput '${formattedDate}'`;
        
        const query = `exec PayrollMaster_ChangeStatus '${Id}',${status}`; 
        
        const apiResponse = await pool.request().query(query);  
        
        let letResponseData = {}; 
        res.status(200).json({
            message: `Payroll saved successfully!`,
            data: ''
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// payrollSave

const payrollConfigurationSave = async (req, res) => {  
    const formData = req.body; 
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 

        console.log('formData');
        console.log(formData);


        const result = await pool.request()
            .input('ID2', sql.NVarChar(250), formData.ID2)  
            .input("PayrollStartDate", sql.NVarChar(255), formData.payrollStartDate)
            .input("PayFrequency", sql.NVarChar(255), formData.payFrequency)  
            .input('createdBy', sql.NVarChar(250), formData.createdBy || "Admin")  
            .input("workingHours", sql.NVarChar(255), formData.workingHours) 
            .input("payMonthStartDate", sql.NVarChar(255), formData.payMonthStartDate) 
            .input("payMonthEndDate", sql.NVarChar(255), formData.payMonthEndDate) 
            .input("totalPayDays", sql.NVarChar(255), formData.totalPayDays) 
            .input("isFullCalendar", sql.BIT, formData.isFullCalendar == 'true' ? 1 : 0) 
            .output('NewID', sql.NVarChar(255))  
            .execute('PayrollConfiguration_SaveOrUpdate');    
 
        let newId =  result.output.NewID; 
        let encryptedId =  formData.ID2;
        if(formData.ID2 == '0'){
            encryptedId =  encryptID(newId);
            // console.log(encryptedId); 
            await pool.request()
            .query(`
                UPDATE PayrollConfiguration 
                SET ID2 = '${encryptedId}' 
                WHERE Id = ${newId}
            `);
        }
        if(formData.workingDays){
            payrollWorkingDaysSaveUpdate(encryptedId,req,pool);
        }
        if(formData.holidays){
            payrollPublicHolidaySaveUpdate(encryptedId,req,pool);
        }
        

        res.status(200).json({
            message: `Payroll configuration saved successfully!`,
            data: ''
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// payrollConfigurationSave
async function payrollWorkingDaysSaveUpdate (payrollId, req,pool){
    
    const { workingDays, createdBy } = req.body;
     
    try {
             
             
            const workingDaysData = JSON.parse(workingDays); 
            console.log('workingDays');
            console.log(workingDays);
            console.log('payrollId');
            console.log(payrollId);


            


            const formatTime = (time) => {
                return time.length === 5 ? `${time}:00` : time; // Convert "08:00" to "08:00:00"
            }; 
            try { 
                for (const record of workingDaysData) { 

                    await pool.request() 
                      .input("PayrollConfigurationId", sql.NVarChar(65), payrollId)
                      .input("DayOfWeek", sql.NVarChar(100), record.day)
                      .input("StartTime", sql.NVarChar(50), formatTime(record.start))
                      .input("EndTime", sql.NVarChar(100), formatTime(record.end))
                      .input("IsWeeklyOff", sql.Bit, record.off ? 1 : 0)
                      .input("CreatedBy", sql.NVarChar(100), createdBy)
                      .execute("PayrollWorkingDays_SaveOrUpdate");
                }
  
               return true;
            } catch (err) { 
                throw new Error(err.message);
            } 
             
        } catch (error) { 
            throw new Error(error.message); 
        }
}
// end of payrollWorkingDaysSaveUpdate
async function payrollPublicHolidaySaveUpdate (payrollId, req,pool){
    
    const { holidays, createdBy } = req.body;
     
    try {
             
             
            const holidaysData = JSON.parse(holidays); 
            console.log('holidaysData');
            console.log(holidaysData);

 
            try { 
                for (const record of holidaysData) {
                    // console.log(record);
                    await pool.request() 
                      .input("ID2", sql.NVarChar(65), record.ID2)
                      .input("Name", sql.NVarChar(255), record.name)
                      .input("StartDate", sql.NVarChar(255), record.startDate)
                      .input("EndDate", sql.NVarChar(255), record.endDate) 
                      .input("NumberOfDays", sql.Int, record.numberOfDays)
                      .input("CreatedBy", sql.NVarChar(100), createdBy)
                      .execute("PublicHoliday_SaveOrUpdate");
                } 
    
               return true;
            } catch (err) { 
                throw new Error(err.message);
            } 
             
        } catch (error) { 
            throw new Error(error.message); 
        }
}
// end of payrollPublicHolidaySaveUpdate

const getPayrollConfiguration = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec Get_PayrollConfiguration `;  
        const apiResponse = await pool.request().query(query);  

        const queryPayrollWorkingDays = `exec Get_PayrollWorkingDays`;  
        const apiPayrollWorkingDaysResponse = await pool.request().query(queryPayrollWorkingDays);  
        
        const queryPublicHoliday = `exec Get_PublicHoliday`; 
        const apiPublicHolidayResponse = await pool.request().query(queryPublicHoliday);  
         

        let letResponseData = {};
        if(apiResponse.recordset){ 
            letResponseData =  {
                configuration: apiResponse.recordset[0],
                workingDays: apiPayrollWorkingDaysResponse.recordset,
                holidays: apiPublicHolidayResponse.recordset,
            };
        }   
        res.status(200).json({
            message: `Payroll configuration loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPayrollConfiguration

const getPayrollSummary = async (req, res) => {  
    const {payDate} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
           

        const query = `exec GetPayrollMasterSummary `; 
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
    const {Id,isDraft,isPayroll,isAccrual,isEOS} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        let query = null;
        let payrollRollStatus =  'Draft';
        if(isAccrual){
            query = `exec Get_Accrual_PayrollOutput_New '${Id}', 1`; 
            payrollRollStatus = 'Active';
        }else if(isPayroll){
            const now = new Date(); 
            const formattedDate = getStartOfMonth(now); 
            // const formattedDate = '2025-04-01';  
            // const apiHistoryResponse = await pool.request().query(`exec GetPayrollMasterSummary '${Id}' `); 
            const apiHistoryResponse = await pool.request().query(`exec GetPayrollMasterDetails '${Id}' `); 
            
            console.log('apiHistoryResponse.recordset');
            console.log(apiHistoryResponse.recordset);
            if(apiHistoryResponse.recordset.length > 0){
                payrollRollStatus = apiHistoryResponse.recordset[0].Status; 
                const payDate  = apiHistoryResponse.recordset[0].PayrollDate; 

                // query = `exec Get_PayrollOutputHistory '${Id}'`;  
                // query = `exec Get_PayrollOutput '${payDate}'`; 
                 
                query = `exec GetDraftPayrollOutput '${Id}'`;  
                 


            }
        }else if(isEOS){
            query = `exec Get_Accrual_PayrollOutput_New '${Id}', 0`; 
            payrollRollStatus = 'Active';
        } 
        
        // console.log('query');
        // console.log('isDraft',isDraft);
        // console.log('isAccrual',isAccrual);

        console.log('query');
        console.log(query);

        const apiResponse = await pool.request().query(query);  
        // console.log('apiResponse.recordset');
        // console.log(apiResponse.recordset);


         // Calculate totals
        let totalEmployees = 0;
        let totalPaidDaysTotalEarnings = 0;
        let totalBenefits = 0;
        let totalDeductions = 0; 
        
        let totalNetTotal = 0;
        let payCalendarMonth = '';
        let payCalendarDays = '';

        

        let letResponseData = {};
        let payrollSummary = {}; 

        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset; 
            letResponseData.forEach(employee => { 

                totalPaidDaysTotalEarnings += parseFloat(String(employee.PaidDaysTotalEarnings || 0).replace(/,/g, ''));
                totalBenefits += parseFloat(String(employee.TotalBenefits || 0).replace(/,/g, ''));
                totalDeductions += parseFloat(String(employee.TotalDeductions || 0).replace(/,/g, ''));
                totalNetTotal += parseFloat(String(employee.NetTotal || 0).replace(/,/g, ''));
                
            });
            totalEmployees = letResponseData.length;
            payCalendarMonth = apiResponse.recordset[0].PayCalendarMonth;
            payCalendarDays = apiResponse.recordset[0].PayCalendarDays; 
             
            payrollSummary = {
                totalEmployees:totalEmployees,
                totalPaidDaysTotalEarnings:totalPaidDaysTotalEarnings,
                totalBenefits:totalBenefits,
                totalDeductions:totalDeductions,
                totalNetTotal:totalNetTotal,
                payCalendarMonth:payCalendarMonth,
                payCalendarDays:payCalendarDays,
                payrollRollStatus:payrollRollStatus
            }
            // console.log(payrollSummary);
            // console.log(payrollSummary);

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

const getPayrollEmployeeDetails = async (req, res) => {  
    const {Id,employeeId,payMonth} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = ''; 
        query = `exec GetDraftPayrollOutput '${Id}','${employeeId}'`;   
        const apiResponse = await pool.request().query(query); 
        
        let paySlipInfo = {};
        if(apiResponse.recordset.length > 0){
            const earningsQuery = `exec Get_DraftPayroll_Components  '${employeeId}', '${Id}','Earnings'` ; 
            const apiearningsResponse = await pool.request().query(earningsQuery); 
            
            const benefitsQuery = `exec Get_DraftPayroll_Components  '${employeeId}', '${Id}','Benefits'` ; 
            const apiBenefitsResponse = await pool.request().query(benefitsQuery); 
            
            const deductionsQuery = `exec Get_DraftPayroll_Components  '${employeeId}', '${Id}','Deductions'` ;  
            const apiDeductionsResponse = await pool.request().query(deductionsQuery); 
       
            const allowanceQuery = `exec Get_DraftPayroll_Components  '${employeeId}', '${Id}','OneTimeAllowance'` ;  
            const apiAllowanceQueryResponse = await pool.request().query(allowanceQuery); 
       
            const earnings = Object.entries(apiearningsResponse.recordset[0])  
            .filter(([key, value]) => !["TotalEarnings"].includes(key) && value)  
            .map(([key, value]) => ({ component: key, amount: value }));

            
            const benefits = Object.entries(apiBenefitsResponse.recordset[0])
            // .filter(([key]) => !["TotalEarnings", "TotalBenefits"].includes(key))
            .filter(([key, value]) => !["TotalEarnings", "TotalBenefits", "GrossTotal"].includes(key) && value) 
            .map(([key, value]) => ({ component: key, amount: value }));

            const deductions = Object.entries(apiDeductionsResponse.recordset[0])  
            .filter(([key, value]) => !["TotalDeductions"].includes(key) && value)  
            .map(([key, value]) => ({ component: key, amount: value }));

            const allowances = Object.entries(apiAllowanceQueryResponse.recordset[0])  
            .filter(([key, value]) => !["TotalOneTimeAllowance"].includes(key) && value)  
            .map(([key, value]) => ({ component: key, amount: value }));


            paySlipInfo = {
                employeeInfo:apiResponse.recordset[0],
                employeeEarnings:earnings,
                employeeBenefits:benefits,  
                employeeDeductions:deductions,
                employeeAllowances:allowances, 

            }

        }


        res.status(200).json({
            message: `Payslip loaded successfully!`,
            data:paySlipInfo // apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getPayrollEmployeeDetails

function getStartOfMonth(date){
    // return date ? new Date(date).toISOString().slice(0, 10).replace("T", " ") : null;
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);  
    const year = startOfMonth.getFullYear();
    const month = String(startOfMonth.getMonth() + 1).padStart(2, '0');
    const day = String(startOfMonth.getDate()).padStart(2, '0'); 
    const formattedDate = `${year}-${month}-${day}`; 
    return formattedDate;
};
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


 

module.exports =  {getPayrollConfiguration,payrollConfigurationSave,payrollSave,getPayrollHistory,getPayrollAccrualPreview,getPayrollEmployeeDetails,getPayrollPreview,getPayrollSummary,getSalaryComponentDeductionDetails,getSalaryComponentDeductionsList,salaryComponentDeductionSaveUpdate,getSalaryComponentBenefitDetails,getSalaryComponentBenefitsList,salaryComponentBenefitSaveUpdate,salaryComponentSaveUpdate,getSalaryComponentList,getSalaryComponentDetails} ;
