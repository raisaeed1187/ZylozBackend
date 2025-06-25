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

  
const employeeSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                  
                let imgUrl = null;
                if(Array.isArray(req.files)){ 
                    const matchingFile = req.files.find(f => f.fieldname === 'img');
                    if(matchingFile){
                        imgUrl = matchingFile ? (await uploadDocument(matchingFile)).fileUrl : null;
                    }else{
                        imgUrl =  formData.img;
                    }
                }else{
                    imgUrl =  formData.img;
                } 

                console.log('formData');
                console.log(formData);
                console.log('imgUrl');
                console.log(imgUrl);


  
                const result = await pool.request()
                    .input('ID2', sql.NVarChar(250), formData.ID2)  
                    .input("name", sql.NVarChar(255), formData.name)
                    .input("employeeId", sql.NVarChar(50), formData.employeeId)
                    .input("organizationId", sql.NVarChar(65), formData.organizationId)
                    .input("joiningDate", sql.NVarChar(255), formData.joiningDate)
                    .input("jobTitle", sql.NVarChar(255), formData.jobTitle)
                    .input("employmentType", sql.NVarChar(100), formData.employmentType)
                    .input("email", sql.NVarChar(255), formData.email)
                    .input("phone", sql.NVarChar(50), formData.phone)
                    .input("department", sql.NVarChar(255), formData.department)
                    .input("jobPosition", sql.NVarChar(255), formData.jobPosition)
                    .input("manager", sql.NVarChar(255), formData.manager)
                    .input("img", sql.NVarChar(sql.MAX), imgUrl)
                    .input("isUAENational", sql.Bit, formData.isUAENational)
                    .input("originCountry", sql.NVarChar(100), formData.originCountry) 
                    .input("contractType", sql.NVarChar(100), formData.contractType)  
                    .input("IsSubmit", sql.Int, formData.isSubmit == '1' ? 1 : 0)   
                    .input('createdBy', sql.NVarChar(250), formData.createdBy || "Admin")  
                    .output('NewID', sql.NVarChar(255))  
                    .execute('Employee_Save_Update');    

                let newId =  result.output.NewID; 
                let encryptedId =  formData.ID2;
                if(formData.ID2 == '0'){
                     encryptedId =  encryptID(newId);
                    console.log(encryptedId); 
                    await pool.request()
                    .query(`
                        UPDATE Employee 
                        SET ID2 = '${encryptedId}' 
                        WHERE Id = ${newId}
                    `);
                }
                 
                 
                if(formData.employeePersonalInfo){
                   await employeePersonalInfoSaveUpdate(req,encryptedId);
                }
                if(formData.employeeSalaryDetails){
                   await employeeSalaryDetailsSaveUpdate(req,encryptedId);
                }
                if(formData.employeeBenefits){
                    await employeeBenefitSaveUpdate(req,encryptedId);
                }
                if(formData.employeeDocuments){
                    employeeDocumentSaveUpdate(req,encryptedId);
                }

                
                // let attachments = null;
                // console.log('before attachments');
                // console.log(req.files);
                // if(Array.isArray(req.files?.attachments)){
                //     console.log('inside attachments');
                //     attachments = req.files["attachments"]
                //         ? await Promise.all(req.files["attachments"].map(file => uploadDocument(file).then((res)=>{return res})))
                //         : []; 
                // }
                // if(attachments){
                //     await saveEmployeeDocuments(pool,attachments,encryptedId,formData);
                // }

                res.status(200).json({
                    message: 'Employee saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of employeeSaveUpdate

async function employeePersonalInfoSaveUpdate(req,EmployeeId){
    const formData = req.body; 
    const employeeData = JSON.parse(formData.employeePersonalInfo); 
    try {
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try {    
                    let result = await pool.request()
                    .input('ID2', sql.NVarChar(350), employeeData.ID2)
                    .input('employeeId', sql.NVarChar(355), EmployeeId) 
                    .input('eID', sql.NVarChar, employeeData.eID)
                    .input('eidExpiryDate', sql.NVarChar, employeeData.eidExpiryDate)  // Added eID Expiry Date
                    .input('address', sql.NVarChar, employeeData.address)
                    .input('city', sql.NVarChar, employeeData.city)
                    .input('state', sql.NVarChar, employeeData.state)
                    .input('zip', sql.NVarChar, employeeData.zip)
                    .input('country', sql.NVarChar, employeeData.country)
                    .input('privateEmail', sql.NVarChar, employeeData.privateEmail)
                    .input('privatePhone', sql.NVarChar, employeeData.privatePhone)
                    .input('bankAccount', sql.NVarChar, employeeData.bankAccount)
                    .input('privateCarPlate', sql.NVarChar, employeeData.privateCarPlate)
                    .input('nationality', sql.NVarChar, employeeData.nationality)
                    .input('identificationNo', sql.NVarChar, employeeData.identificationNo)
                    .input('passportNo', sql.NVarChar, employeeData.passportNo)
                    .input('passportExpiryDate', sql.NVarChar, employeeData.passportExpiryDate) // Added Passport Expiry Date
                    .input('gender', sql.NVarChar, employeeData.gender)
                    .input('birthday', sql.NVarChar, employeeData.birthday)
                    .input('placeOfBirth', sql.NVarChar, employeeData.placeOfBirth)
                    .input('countryOfBirth', sql.NVarChar, employeeData.countryOfBirth)
                    .input('emergencyContactName', sql.NVarChar, employeeData.emergencyContactName)
                    .input('emergencyContactPhone', sql.NVarChar, employeeData.emergencyContactPhone)
                    .input('maritalStatus', sql.NVarChar, employeeData.maritalStatus)
                    .input('dependentChildren', sql.Int, employeeData.dependentChildren)
                    .input('educationLevel', sql.NVarChar, employeeData.educationLevel)
                    .input('fieldOfStudy', sql.NVarChar, employeeData.fieldOfStudy)
                    .input('school', sql.NVarChar, employeeData.school)
                    .input('visaNo', sql.NVarChar, employeeData.visaNo)
                    .input('visaExpiry', sql.NVarChar, employeeData.visaExpiry)
                    .input('workPermitNo', sql.NVarChar, employeeData.workPermitNo)
                    .input('workPermitExpirationDate', sql.NVarChar, employeeData.workPermitExpirationDate)
                    .input('medicalInsurence', sql.NVarChar, employeeData.medicalInsurence)  
                    .input('medicalInsurenceExpiry', sql.NVarChar, employeeData.medicalInsurenceExpiry) 
                    .input('molNo', sql.NVarChar, employeeData.molNo)  
                    .input('bankCode', sql.NVarChar, employeeData.bankCode)  
                    .input('bankName', sql.NVarChar, employeeData.bankName)  
                    .input('bankIbanNo', sql.NVarChar, employeeData.bankIbanNo)  
                    .input('bankSwiftCode', sql.NVarChar, employeeData.bankSwiftCode)  
                    .input('isOTapplicable', sql.BIT, employeeData.isOTapplicable == true ? 1 : 0)   
                    .input('createdBy', sql.NVarChar(250), employeeData.createdBy || "Admin") 
                    .output('NewID', sql.NVarChar(255)) 
                    .execute('EmployeePersonalInfo_Save_Update');
                  
                return true;
                
            } catch (err) { 
                throw new Error(err.message);
            }  
        } catch (error) { 
            throw new Error(error.message);
        }
}
// end of employeePersonalInfoSaveUpdate
async function employeeSalaryDetailsSaveUpdate(req,EmployeeId){
    const formData = req.body; 
    const employeeSalaryDetailsFormData = JSON.parse(formData.employeeSalaryDetails); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (employeeSalaryDetailsFormData) {
                    for (let employeeSalary of employeeSalaryDetailsFormData) {  
                        if(employeeSalary.name){
                            let result = await pool.request()
                                .input('ID2', sql.NVarChar(350), employeeSalary.ID2)
                                .input('EmployeeID', sql.NVarChar(355), EmployeeId) 
                                .input('Name', sql.NVarChar(250), employeeSalary.name)
                                .input('CalculationType', sql.NVarChar(255), employeeSalary.calculationType)
                                .input('Monthly', sql.Decimal(10, 2), employeeSalary.monthly)
                                .input('AnnuallyAmount', sql.Decimal(10, 2), employeeSalary.annual)
                                .input('CreatedBy', sql.NVarChar(50), formData.createdBy) 
                                .output('NewID', sql.NVarChar(255)) 
                                .execute('EmployeeSalaryDetails_Save_Update');
                        }
                    }  
                } 
                const now = new Date(); 
                const formattedDate = getStartOfMonth(now); 
                const runPayrollQuery = `exec Save_PayrollOutput '${formattedDate}'`; 
                 
                const apiRunPayrollResponse = await pool.request().query(runPayrollQuery);  
                

                return true;
                
            } catch (err) { 
                throw new Error(err.message);
            }  
        } catch (error) { 
            throw new Error(error.message);
        }
}
// end of employeeSalaryDetailsSaveUpdate
async function employeeBenefitSaveUpdate(req,EmployeeId){
    const formData = req.body; 
    const employeeBenefitsFormData = JSON.parse(formData.employeeBenefits); 
    try {
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (employeeBenefitsFormData) {
                    for (let employeeBenefit of employeeBenefitsFormData) {  
                        if(employeeBenefit.name){
                            let result = await pool.request()
                                .input('ID2', sql.NVarChar(350), employeeBenefit.ID2)
                                .input('EmployeeID', sql.NVarChar(355), EmployeeId) 
                                .input('BenefitId', sql.NVarChar(355), employeeBenefit.benefitId)  
                                .input('Name', sql.NVarChar(250), employeeBenefit.name)
                                .input('Monthly', sql.Decimal(10, 2), employeeBenefit.monthly)
                                .input('AnnuallyAmount', sql.Decimal(10, 2), employeeBenefit.annual) 
                                .input('EffectedPeriod', sql.Int, employeeBenefit.effectedPeriod)  
                                .input('CreatedBy', sql.NVarChar(50), formData.createdBy) 
                                .output('NewID', sql.NVarChar(255)) 
                                .execute('EmployeeBenefit_Save_Update');
                        }
                    } 
                    const now = new Date(); 
                    const formattedDate = getStartOfMonth(now); 
                    const runPayrollQuery = `exec Save_PayrollOutput '${formattedDate}'`; 
                    const apiRunPayrollResponse = await pool.request().query(runPayrollQuery);  
                    
                } 
                return true;
                
            } catch (err) { 
                throw new Error(err.message);
            }  
        } catch (error) { 
            throw new Error(error.message);
        }
}
const employeeDeductionSaveUpdate = async (req,res)=>{ 
    const formData = req.body;  
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                const frequencyCount = parseInt(formData.deductionFrequency) || 1;
                let currentPayrollDate = new Date(formData.effectiveFrom + '-01'); // Convert 'YYYY-MM' to a full date string (e.g., '2025-03-01')
 
                for (let i = 0; i < frequencyCount; i++) {  
                    if(i > 0)
                        currentPayrollDate.setMonth(currentPayrollDate.getMonth() + 1);
                    
                    const updatedPayrollDate = currentPayrollDate.toISOString().split('T')[0]; // Format to 'YYYY-MM-DD'

             
                    let result = await pool.request()
                        .input('EmployeeId', sql.NVarChar, formData.employeeId)
                        .input('DeductionType', sql.NVarChar, formData.deductionType)
                        .input('DeductionTypeId', sql.NVarChar, formData.deductionTypeId)
                        .input('DeductionFrequency', sql.NVarChar, formData.deductionFrequency)
                        .input('TotalAmount', sql.Decimal(10, 2), formData.totalAmount)
                        .input('AmountPerMonth', sql.Decimal(10, 2), formData.amountPerMonth)
                        .input('EffectiveFrom', sql.Date, formData.effectiveFrom)
                        .input('PayrollDate', sql.Date, updatedPayrollDate)
                        .input('Remarks', sql.NVarChar, formData.remarks)
                        .input('CreatedBy', sql.NVarChar, formData.createdBy)
                        .output('NewID', sql.NVarChar(255)) 
                        .execute('EmployeeDeduction_Save_Update');

                
                }   
                  
                const runPayrollQuery = `exec Get_PayrollOutput '${formData.payrollDate}'`; 
                const apiRunPayrollResponse = await pool.request().query(runPayrollQuery);  
                
                res.status(200).json({
                    message: 'Employee deduction saved/updated',
                    data: '' //result
                });
            } catch (err) {  
                return res.status(400).json({ message: err.message,data:null}); 

            }  
        } catch (error) {  
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// employeeDeductionSaveUpdate
function getStartOfMonth(date){
    // return date ? new Date(date).toISOString().slice(0, 10).replace("T", " ") : null;
    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);  
    const year = startOfMonth.getFullYear();
    const month = String(startOfMonth.getMonth() + 1).padStart(2, '0');
    const day = String(startOfMonth.getDate()).padStart(2, '0'); 
    const formattedDate = `${year}-${month}-${day}`; 
    return formattedDate;
};

const employeeOneTimeAllowanceSaveUpdate = async (req,res)=>{ 
    const formData = req.body;  
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
               
                let currentPayrollDate = new Date(formData.effectiveFrom + '-01'); 
 
                 
                let result = await pool.request()
                    .input('ID2', sql.NVarChar, '0')
                    .input('EmployeeId', sql.NVarChar, formData.employeeId) 
                    .input('AllowanceType', sql.NVarChar, formData.allowanceType)
                    .input('AllowanceTypeId', sql.NVarChar, formData.allowanceTypeId) 
                    .input('TotalAmount', sql.Decimal(10, 2), formData.totalAmount) 
                    .input('EffectiveFrom', sql.Date, formData.effectiveFrom)
                    .input('PayrollDate', sql.Date, currentPayrollDate)
                    .input('Remarks', sql.NVarChar, formData.remarks)
                    .input('CreatedBy', sql.NVarChar, formData.createdBy)
                    .output('NewID', sql.NVarChar(255)) 
                    .execute('EmployeeOneTimeAllowance_Save_Update');

                const now = new Date(); 
                const formattedDate = getStartOfMonth(now); 
                const runPayrollQuery = `exec Get_PayrollOutput '${formData.payrollDate}'`; 
                
                const apiRunPayrollResponse = await pool.request().query(runPayrollQuery);  
                
                    
                    
                res.status(200).json({
                    message: 'Employee one time allowance saved/updated',
                    data: '' //result
                });
            } catch (err) {  
                return res.status(400).json({ message: err.message,data:null}); 

            }  
        } catch (error) {  
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// employeeOneTimeAllowanceSaveUpdate

const employeeRevisionSaveUpdate = async (req,res)=>{ 
    const formData = req.body;  
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
            //   console.log('formData');   
            //   console.log(formData);   

            let result = await pool.request()
                .input('ID2', sql.NVarChar(65), formData.ID2)
                .input('EmployeeId', sql.NVarChar(65), formData.employeeId) 
                .input('EffectiveDate', sql.NVarChar, formData.effectiveDate)
                .input('RevisionReason', sql.NVarChar(250), formData.revisionReason)
                .input('RevisionRemarks', sql.NVarChar(350), formData.revisionRemarks)
                .input('CreatedBy', sql.NVarChar(350), formData.createdBy) 
                .execute('EmployeeRevisions_SaveOrUpdate');

                 
                res.status(200).json({
                    message: 'Employee revision saved/updated',
                    data: '' //result
                });
            } catch (err) {  
                return res.status(400).json({ message: err.message,data:null}); 

            }  
        } catch (error) {  
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// employeeRevisionSaveUpdate

const getEmployeeRevisions = async (req,res)=>{ 
    const {Id} = req.body;  
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
            //   console.log('formData');   
            //   console.log(formData);   
 
            const  query = `exec EmployeeRevisions_Get '${Id}'`;  

            const apiResponse = await pool.request().query(query); 
               
        
                res.status(200).json({
                    message: 'Employee revisions list',
                    data: apiResponse.recordset //result
                });
            } catch (err) {  
                return res.status(400).json({ message: err.message,data:null}); 

            }  
        } catch (error) {  
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// getEmployeeRevisions

async function employeeDocumentSaveUpdate(req,EmployeeId){
    const formData = req.body; 
    const employeeData = JSON.parse(formData.employeeDocuments); 
    console.log(employeeData);
    try {
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try {    
                   
                const documents = employeeData || [];
                const files = req.files || []; 
 
                documents.forEach(async (doc, index) =>  {
                    const matchingFile = files.find(f => f.fieldname === doc.fileKey);
                    console.log('matchingFile');
                    console.log(matchingFile); 
                    let fileUrl = null;
                    let fileName = null; 
                    if (matchingFile) { 
                        fileUrl = matchingFile ? (await uploadDocument(matchingFile)).fileUrl : null;
                        fileName = matchingFile?.originalname;
                    } else {
                        fileUrl =  doc?.DocumentUrl;
                        fileName = doc?.DocumentName;
                    }
                    console.log('fileUrl New');
                    console.log(fileUrl);

                    await pool.request()
                    .input("ID2", sql.NVarChar, doc?.Id || 0)  
                    .input("EmployeeId", sql.NVarChar(360), EmployeeId)  
                    .input("DocumentType", sql.NVarChar, doc.DocumentType)  
                    .input("DocumentNo", sql.NVarChar, doc.DocumentNumber)  
                    .input("IssueDate", sql.NVarChar, doc.IssueDate)  
                    .input("ExpiryDate", sql.NVarChar, doc.ExpiryDate)  
                    .input("Remarks", sql.NVarChar, doc.Remarks)   
                    .input("DocumentName", sql.NVarChar, fileName)  
                    .input("DocumentUrl", sql.NVarChar, fileUrl)  
                    .input("CreatedBy", sql.NVarChar,formData.createdBy ) 
                    .execute("EmployeeDocument_SaveOrUpdate");

                });

                return true;
                
            } catch (err) { 
                throw new Error(err.message);
            }  
        } catch (error) { 
            throw new Error(error.message);
        }
}
// end of employeeDocumentSaveUpdate

// end of employeeBenefitSaveUpdate
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

async function saveEmployeeDocuments(pool,attachmentUrls,NewID,formData){ 

    try { 
        console.log('attachmentUrls');
        console.log(attachmentUrls);

        if (attachmentUrls.length > 0) {
            for (let url of attachmentUrls) { 
                  console.log('url');
                  console.log(url);

                await pool.request()
                    .input("ID2", sql.NVarChar, "0")  
                    .input("EmployeeId", sql.NVarChar(360), NewID)  
                    .input("DocumentName", sql.NVarChar, url.fileName)  
                    .input("DocumentUrl", sql.NVarChar, url.fileUrl)  
                    .input("CreatedBy", sql.NVarChar,formData.createdBy ) 
                    .execute("EmployeeDocument_SaveOrUpdate");
            }
        } 

    } catch (error) {
        console.error(error);
        throw new Error(error.message);
    }
}
// end of saveEmployeeDocuments

const getEmployeeList = async (req, res) => {  
    
    const {isActiveEmployee} = req.body;  

    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        let query = ``; 

        if(isActiveEmployee){
            query = `exec GetActiveEmployees_List`; 
        }else{
            query = `exec GetEmployeeDetails`;  
        }

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
            message: `Customer List loaded successfully!`,
            data: formatedData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getEmployeeList
const getEmployeeDetails = async (req, res) => {  
    const {Id,date,RevisionNo} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        let employeeBenefitsQuery  = null;
        let employeeDeductionQuery  = null;
        let employeeOneTimeAllowanceQuery  = null; 
        let newRevisionNo = null;
        
        let employeeOneTimeAllowance = null;
	     
        const revisionQuery = `SELECT ISNULL(MAX(RevisionNo), 0) as 'RevisionNo' FROM Employee WHERE ID2 = '${Id}';`;  
        const apiRevisionQueryResponse = await pool.request().query(revisionQuery); 
        // console.log('revisionNo');
        // console.log(RevisionNo);

        if(RevisionNo || RevisionNo == 0){
            newRevisionNo = RevisionNo   
        }else{  
            newRevisionNo = apiRevisionQueryResponse.recordset[0].RevisionNo; 
        }
        const query = `exec GetEmployeeDetails '${Id}',${newRevisionNo}`;  
        // console.log('query');
        // console.log(query);

        const apiResponse = await pool.request().query(query);  
        
        const employeeInfoQuery = `exec GetEmployeePersonalInfo '${Id}',${newRevisionNo}`; 
        const employeeInfoQueryResponse = await pool.request().query(employeeInfoQuery); 
        
        const employeeSalaryDetailsQuery = `exec GetEmployeeSalaryDetails '${Id}',${newRevisionNo}`; 
        const employeeSalaryDetailsQueryResponse = await pool.request().query(employeeSalaryDetailsQuery); 
         
        if(date){ 
            employeeBenefitsQuery = `exec GetEmployeeBenefit '${Id}','${date}',${newRevisionNo}`; 
            employeeDeductionQuery = `exec GetEmployeeDeductions '${Id}','${date}',${newRevisionNo}`; 
            employeeOneTimeAllowanceQuery = `exec GetEmployeeOneTimeAllowances '${Id}','${date}'`; 
             
            const employeeOneTimeAllowanceQueryResponse = await pool.request().query(employeeOneTimeAllowanceQuery); 
            employeeOneTimeAllowance = employeeOneTimeAllowanceQueryResponse.recordset;
        }else{
            employeeBenefitsQuery = `exec GetEmployeeBenefit '${Id}',NULL,${newRevisionNo}`; 
            employeeDeductionQuery = `exec GetEmployeeDeductions '${Id}',NULL,${newRevisionNo}`; 
            
        }  
        const employeeBenefitsQueryResponse = await pool.request().query(employeeBenefitsQuery); 
        const employeeDeductionsQueryResponse = await pool.request().query(employeeDeductionQuery); 
       
        const employeeDocumentQuery = `exec getEmployeeDocuments '${Id}'`; 
        const employeeDocumentQueryResponse = await pool.request().query(employeeDocumentQuery); 
      

        let employeeInfo = null; 

        if(employeeInfoQueryResponse.recordset){
           employeeInfo = employeeInfoQueryResponse.recordset[0]; 
        }
        
        

        let letResponseData = {};
        if(apiResponse.recordset){
            // letResponseData = apiResponse.recordset[0];
            letResponseData = {
                employeeDetails: apiResponse.recordset[0],
                employeePersonalInfo: employeeInfo,
                salaryDetails: employeeSalaryDetailsQueryResponse.recordset,
                employeeBenefits: employeeBenefitsQueryResponse.recordset,
                employeeDeductions: employeeDeductionsQueryResponse.recordset,
                employeeOneTimeAllowance: employeeOneTimeAllowance,
                employeeDocuments: employeeDocumentQueryResponse.recordset,


            }
        }  
        res.status(200).json({
            message: `employees details loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getEmployeeDetails
const deleteEmployeeItem = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec DeleteEmployeeItem '${Id}'`; 
        const apiResponse = await pool.request().query(query); 
       
        // const contactsQuery = `exec GetCustomerContactsList '${Id}'`; 
        // const contactsQueryResponse = await pool.request().query(contactsQuery); 
         
        res.status(200).json({
            message: `Employee Item Deleted successfully!`,
            data: null
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of deleteEmployeeItem
const getEmployeeDocuments = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec getEmployeeDocuments '${Id}'`; 
        const apiResponse = await pool.request().query(query); 
        let letResponseData = {};
        if(apiResponse.recordset){
            letResponseData = apiResponse.recordset;
        }  
        res.status(200).json({
            message: `Employee documents loaded successfully!`,
            data: letResponseData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getEmployeeDocuments
const getEmployeeStatus = async (req, res) => {  
    const {Id} = req.body; // user data sent from client
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec CustomerEmployeeStatus_Get `; 
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Employee status successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getEmployeeStatus
const employeeChangeStatus = async (req, res) => {  
    const {Id,StatusId} = req.body; // user data sent from client
    
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec ChangeStatus_CustomerEmployee '${Id}', '${StatusId}'`; 
        const apiResponse = await pool.request().query(query); 
        
        res.status(200).json({
            message: `Employee status updated successfully!`,
            data: null
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of employeeChangeStatus

const employeeDeleteDocument = async (req, res) => {  
    const {Id,deleteType} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        
        let query = null; 
        if(deleteType == 'employeeBenefit'){
            query = `exec EmployeeBenefit_Delete '${Id}'`;  
        }else{
            query = `exec EmployeeDocument_Delete '${Id}'`; 
        }
           
        const apiResponse = await pool.request().query(query);  
          
        res.status(200).json({
            message: `employees document deleted successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of employeeDeleteDocument

const employeeDeleteDeductionOrAllowance = async (req, res) => {  
    const {Id,component,componentName,payrollDate} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        
        let query = null;  

        query = `exec EmployeeDeductionOrAllowance_Delete '${Id}','${component}','${componentName}','${payrollDate}'`;  
         
           
        const apiResponse = await pool.request().query(query);  
          
        res.status(200).json({
            message: `employee allowance deleted successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of employeeDeleteDeductionOrAllowance

const employeePayslips = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        
        let query = null;  
        query = `exec Get_EmployeePaySlips '${Id}'`; 
        
           
        const apiResponse = await pool.request().query(query);  
          
        res.status(200).json({
            message: `employees payslips successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of employeePayslips
 
// ----------- end of employee


const employeeLeaveSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;   
            const pool = await sql.connect(config);
            try {  
                let result = null;
                if(formData.resumeDate){  
                     result = await pool.request()
                    .input('ID2', sql.NVarChar(250), formData.ID2)   
                    .input("isResumed", sql.Bit, 1)
                    .input("resumptionDate", sql.Date, formData.resumeDate) 
                    .input("remarks", sql.NVarChar(500), formData.reason) 
                    .input('createdBy', sql.NVarChar(250), formData.createdBy || "Admin") 
                    .execute('EmployeeLeave_Resumption');    
                }else if(formData.isDelete && formData.isDelete == 'true'){  
                    result = await pool.request()
                    .input('ID2', sql.NVarChar(250), formData.ID2)  
                    .input("employeeId", sql.NVarChar(250), formData.employeeId)
                    .input("startDate", sql.Date, formData.startDate)
                    .input("endDate", sql.Date, formData.endDate) 
                    .input("leaveType", sql.NVarChar(255), formData.leaveType)
                    .input("IsAttendanceAbsent", sql.NVarChar(255), 0)
 
                    .execute('EmployeeLeave_Delete');  

                } else{ 
                     result = await pool.request()
                        .input('ID2', sql.NVarChar(250), formData.ID2)   
                        .input("employeeId", sql.NVarChar(250), formData.employeeId)
                        .input("leaveType", sql.NVarChar(255), formData.leaveType)
                        .input("startDate", sql.Date, formData.startDate)
                        .input("endDate", sql.Date, formData.endDate) 
                        .input("noOfDays", sql.NVarChar(255), formData.noOfDays)
                        .input("reason", sql.NVarChar(500), formData.reason) 
                        .input("IsAttendanceAbsent", sql.Bit, 0)  
                        .input('createdBy', sql.NVarChar(250), formData.createdBy || "Admin")  
                        .output('NewID', sql.NVarChar(255))  
                        .execute('EmployeeLeave_Save_Update');    
                } 

                let newId =  result.output.NewID; 
                let encryptedId =  formData.ID2;
              
                res.status(200).json({
                    message: 'Employee Leave saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of employeeLeaveSaveUpdate
const getEmployeeLeavesList = async (req, res) => {  
    const {EmployeeId} = req.body;  
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        // const query = `exec GetEmployeeLeaves null,'${EmployeeId}'`; 
        const query = `exec GetEmployeeLeaves `; 
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
            message: `Employee Leave List loaded successfully!`,
            data: formatedData
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getEmployeeLeavesList
const getEmployeeLeaveDetails = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec GetEmployeeLeaves null,'${Id}'`; 
        const apiResponse = await pool.request().query(query);  
        
        let employeeInfo = null; 

        if(apiResponse.recordset){
           employeeInfo = apiResponse.recordset[0]; 
        }
        
          
        res.status(200).json({
            message: `employees leave details loaded successfully!`,
            data: employeeInfo
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getEmployeeLeaveDetails
const getEmployeeLeaveTypes = async (req, res) => {  
    const {Id,startDate,leaveCode} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
        
        let query = null;
        if(leaveCode){
            query = `exec GetEmployeeLeaveTypes '${Id}','${startDate}','${leaveCode}'`; 
        }else{
            query = `exec GetEmployeeLeaveTypes '${Id}','${startDate}'`; 
        }
        
        const apiResponse = await pool.request().query(query);  
         
 
        res.status(200).json({
            message: `employees leave types loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getEmployeeLeaveTypes

const employeeExitClearanceSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try {   
                    // console.log('formData');
                    // console.log(formData);

                    const result = await pool.request()
                    .input('ID2', sql.NVarChar, formData.ID2)
                    .input('employeeId', sql.NVarChar, formData.employeeId)
                    .input('exitType', sql.NVarChar, formData.exitType)
                    .input('lastWorkingDay', sql.Date, formData.lastWorkingDay)
                    .input('reason', sql.NVarChar, formData.reason)
                    .input('handoverDone', sql.Bit, toBit(formData.handoverDone))
                    .input('handoverTo', sql.NVarChar, formData.handoverTo)
            
                    .input('HrCleared', sql.Bit, toBit(formData.HR))
                    .input('hrRemarks', sql.NVarChar, formData.hrRemarks)
                    .input('ItCleared', sql.Bit, toBit(formData.IT))
                    .input('itRemarks', sql.NVarChar, formData.itRemarks)
                    .input('FinanceCleared', sql.Bit, toBit(formData.Finance))
                    .input('financeRemarks', sql.NVarChar, formData.financeRemarks)
                    .input('AdminCleared', sql.Bit, toBit(formData.Admin))
                    .input('adminRemarks', sql.NVarChar, formData.adminRemarks)
            
                    .input('exitInterviewDone', sql.Bit, toBit(formData.exitInterviewDone))
                    .input('finalSettlement', sql.Bit, toBit(formData.finalSettlement))
                    .input('hrComments', sql.NVarChar, formData.hrComments)
                    .input('createdBy', sql.NVarChar, formData.createdBy)
                    .output('NewID', sql.NVarChar(250))
                    .execute('EmployeeExitForm_SaveOrUpdate');
                
 
                let newId =  result.output.NewID; 
                let encryptedId =  formData.ID2;
                if(formData.ID2 == '0'){
                     encryptedId =  encryptID(newId);
                    console.log(encryptedId); 
                    await pool.request()
                    .query(`
                        UPDATE EmployeeExitForm 
                        SET ID2 = '${encryptedId}' 
                        WHERE Id = ${newId}
                    `);
                }
                let attachments = null;
                console.log('before attachments');
                console.log(req.files);
                if(Array.isArray(req.files?.attachments)){
                    console.log('inside attachments');
                    attachments = req.files["attachments"]
                        ? await Promise.all(req.files["attachments"].map(file => uploadDocument(file).then((res)=>{return res})))
                        : []; 
                }
                if(attachments){
                    await saveEmployeeExitClearanceDocuments(pool,attachments,encryptedId,formData);
                }
                res.status(200).json({
                    message: 'Employee exit clearance saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of employeeExitClearanceSaveUpdate
const toBit = (value) => {
    return value === true || value === 'true' ? 1 : 0;
};

async function saveEmployeeExitClearanceDocuments(pool,attachmentUrls,NewID,formData){ 

    try {  

        if (attachmentUrls.length > 0) {
            for (let url of attachmentUrls) { 
                  console.log('url');
                  console.log(url);

                await pool.request()
                    .input("ID2", sql.NVarChar, "0")  
                    .input("EmployeeId", sql.NVarChar(360), formData.employeeId) 
                    .input("ExitClearanceId", sql.NVarChar(360), NewID)   
                    .input("DocumentName", sql.NVarChar, url.fileName)  
                    .input("DocumentUrl", sql.NVarChar, url.fileUrl)  
                    .input("CreatedBy", sql.NVarChar,formData.createdBy ) 
                    .execute("EmployeeExitClearanceDocument_SaveOrUpdate");
            }
        } 

    } catch (error) {
        console.error(error);
        throw new Error(error.message);
    }
}
// end of saveEmployeeExitClearanceDocuments

const getEmployeeExitClearanceList = async (req, res) => {  
    const {EmployeeId} = req.body;  
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec EmployeeExitClearance_Get `; 
        const apiResponse = await pool.request().query(query); 
        
        // Return a response (do not return the whole req/res object)
        res.status(200).json({
            message: `Employee Exit Clearance List loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getEmployeeExitClearanceList
const getEmployeeExitClearanceDetails = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec EmployeeExitClearance_Get '${Id}'`; 
        const apiResponse = await pool.request().query(query);  
        
        let employeeInfo = null; 

        if(apiResponse.recordset){
           employeeInfo = apiResponse.recordset[0]; 
        }
        
          
        res.status(200).json({
            message: `employees exit clearance details loaded successfully!`,
            data: employeeInfo
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getEmployeeExitClearanceDetails


const getPaySlip = async (req, res) => {  
    const {Id2,payMonth} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = ''; 
        query = `exec Get_PaySlip '${Id2}','${payMonth}'`;   
        const apiResponse = await pool.request().query(query); 
        
        const benefitsQuery = `exec Get_PaySlip_Benefits '${Id2}','${payMonth}'` 
        const apiBenefitsResponse = await pool.request().query(benefitsQuery); 
        
        const deductionsQuery = `exec Get_PaySlip_Deductions '${Id2}','${payMonth}'` 
        const apiDeductionsResponse = await pool.request().query(deductionsQuery); 
        let paySlipInfo = {};
        if(apiResponse.recordset.length > 0){
            const benefits = Object.entries(apiBenefitsResponse.recordset[0])
            // .filter(([key]) => !["TotalEarnings", "TotalBenefits"].includes(key))
            .filter(([key, value]) => !["TotalEarnings", "TotalBenefits", "GrossTotal"].includes(key) && value) 
            .map(([key, value]) => ({ component: key, amount: value }));

            const deductions = Object.entries(apiDeductionsResponse.recordset[0])  
            .filter(([key, value]) => !["TotalDeductions"].includes(key) && value)  
            .map(([key, value]) => ({ component: key, amount: value }));


            paySlipInfo = {
                employeeInfo:apiResponse.recordset[0],
                employeeBenefits:benefits,
                employeeDeductions:deductions, 
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
// end of getPaySlip

const outsourcedEmployeeSaveUpdate = async (req,res)=>{
    const formData = req.body;

    try {
             
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                 
                const employees = JSON.parse(formData.employees); 

                console.log('formData');
                console.log(formData); 

                if (employees) {
                    for (let employee of employees) {   
                        if(employee.vendor){
                            const result = await pool.request()
                            .input('ID2', sql.NVarChar(65), employee.ID2)
                            .input('vendor', sql.NVarChar(100), employee.vendor)
                            .input('passportNo', sql.NVarChar(50), employee.passportNo)
                            .input('eidNo', sql.NVarChar(50), employee.eidNo)
                            .input('eidExpiry', sql.NVarChar(100), employee.eidExpiry)  
                            .input('employeeName', sql.NVarChar(100), employee.employeeName)
                            .input('designation', sql.NVarChar(100), employee.designation)
                            .input('startDate', sql.NVarChar(100), employee.startDate)  
                            .input('endDate', sql.NVarChar(100), employee.endDate)
                            .input('ratePerHour', sql.NVarChar(100),  String(employee.ratePerHour ?? ''))
                            .input('paymentTerms', sql.NVarChar(100), employee.paymentTerms)
                            .input('costPerDay', sql.NVarChar(100), String(employee.costPerDay ?? '')) 
                            .input('costPerMonth', sql.NVarChar(100), String(employee.costPerMonth ?? ''))
                            .input('actualWorkDays', sql.Int, employee.actualWorkDays != null ? employee.actualWorkDays : 0  )
                            .input('totalOT', sql.NVarChar(100), String(employee.totalNormalOT != null ? employee.totalNormalOT : 0 ?? ''))
                            .input('otAmount', sql.NVarChar(100), String(employee.totalNormalOTAmount != null ?employee.totalNormalOTAmount : 0  ?? ''))
                            .input('totalCost', sql.NVarChar(100), String(employee.totalCost ?? ''))
                            .input('status', sql.NVarChar(20), employee.status || 'Active')
                            .input('createdBy', sql.NVarChar(100), employee.createdBy || 'Admin')
                            .input('permitDetails', sql.NVarChar(50), employee.permitDetails || '')
                            .input('permitExpiry', sql.NVarChar(100), employee.permitExpiry || null) 
                            .execute('SaveOrUpdateOutsourcedEmployee');                      
                        }
                    }
                }


                res.status(200).json({
                    message: 'Outsourced Employee saved/updated',
                    data: '' //result
                });
            } catch (err) { 
                return res.status(400).json({ message: err.message,data:null}); 

            } 
             
        } catch (error) { 
            return res.status(400).json({ message: error.message,data:null}); 

        }
}
// end of outsourcedEmployeeSaveUpdate

const getOutsourcedEmployees = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config); 
          
        const query = `exec Get_OutsourcedEmployees '${Id}'`; 
        const apiResponse = await pool.request().query(query);  
         
          
        res.status(200).json({
            message: `outsourced details loaded successfully!`,
            data: apiResponse.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getOutsourcedEmployees


module.exports =  {getOutsourcedEmployees,getOutsourcedEmployees,outsourcedEmployeeSaveUpdate,getEmployeeRevisions,employeeRevisionSaveUpdate,employeePayslips,employeeDeleteDeductionOrAllowance,employeeDeleteDocument,getPaySlip,getEmployeeExitClearanceDetails,getEmployeeExitClearanceList,employeeExitClearanceSaveUpdate,employeeOneTimeAllowanceSaveUpdate,employeeDeductionSaveUpdate,getEmployeeLeaveTypes,getEmployeeLeavesList,getEmployeeLeaveDetails,employeeLeaveSaveUpdate,employeeChangeStatus,getEmployeeStatus,deleteEmployeeItem,employeeSaveUpdate,getEmployeeList,getEmployeeDetails,getEmployeeDocuments} ;
