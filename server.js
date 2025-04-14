const express = require("express");
const router = express.Router(); 
const cors = require("cors");
const authenticateToken = require('./middleware');   
const multer = require("multer");
 
const {uploadDocument,getDynamicCreatedTablesWithModules,getMainModules,createNewTable, getDynamicCreatedTables,getTableDetailsById,getSpecificTableField,saveDynamicTableData} = require('./controllers/createNewTableController')
const {signUp,signIn} = require('./controllers/authController'); 
const {orgProfileSaveUpdate,getOrgProfileList,getOrgProfileDetails,getOrgProfileDocuments} = require('./controllers/profileController'); 
const {customerSaveUpdate,deleteCustomerContact,getCustomerList,getCustomerDetails,getCustomerDocuments} = require('./controllers/customerController'); 
const {quotationChangeStatus,getQuotationStatus,quotationSaveUpdate,deleteQuotationItem,getQuotationList,getQuotationDetails,getQuotationDocuments} = require('./controllers/quotationController'); 
const {getPaySlip,getEmployeeExitClearanceDetails,getEmployeeExitClearanceList,employeeExitClearanceSaveUpdate,employeeDeductionSaveUpdate,getEmployeeLeaveTypes,getEmployeeLeavesList,getEmployeeLeaveDetails,employeeLeaveSaveUpdate,employeeChangeStatus,getEmployeeStatus,employeeSaveUpdate,deleteEmployeeItem,getEmployeeList,getEmployeeDetails,getEmployeeDocuments} = require('./controllers/employeeController'); 
const {payrollSave,getPayrollHistory,getPayrollAccrualPreview,getPayrollPreview,getPayrollSummary,salaryComponentSaveUpdate,getSalaryComponentList,getSalaryComponentDetails,getSalaryComponentBenefitDetails,getSalaryComponentBenefitsList,salaryComponentBenefitSaveUpdate,getSalaryComponentDeductionDetails,getSalaryComponentDeductionsList,salaryComponentDeductionSaveUpdate} = require('./controllers/payrollController'); 
const {getCOAAcountTypes,coaSaveUpdate,getCOAList,getCOADetails} = require('./controllers/finance/coaController'); 
const {attendanceSaveUpdate,getAttendanceList} = require('./controllers/hr/attendanceController'); 

 
const app = express();
app.use(express.json());
app.use(cors());

// const storage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         cb(null, "uploads/"); // Adjust the upload path as needed
//     },
//     filename: function (req, file, cb) {
//         cb(null, Date.now() + "-" + file.originalname);
//     }
// });

// const upload = multer({ storage: storage }).fields([
//     { name: "logo", maxCount: 1 },         // Accepts 1 file for logo
//     { name: "attachments", maxCount: 5 }   // Accepts multiple files for attachments
// ]);

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB file size limit
}).fields([
    { name: "logo", maxCount: 1 },
    { name: "img", maxCount: 1 }, 
    { name: "attachments", maxCount: 5 }
]);


const dynamicFileUpload = multer({ dest: "uploads/" });



app.get('/',(req,res)=>{
    return res.json('Hi, am backend');
});

router.get('/protected', authenticateToken, (req, res) => {
    res.json({ message: 'This is a protected route!', user: req.user });
});

app.use('/api', router);

// auth routes
app.post('/api/signup',express.json(),signUp );
app.post('/api/signin',express.json(),signIn );

app.get('/users',authenticateToken,getDynamicCreatedTables);
app.post('/api/get-all-dynamics-tables',authenticateToken,express.json(),getDynamicCreatedTables);
app.post('/api/get-main-modules',authenticateToken,express.json(),getMainModules);
app.post('/api/modules-dynamic-screens',authenticateToken,express.json(),getDynamicCreatedTablesWithModules);


// POST method API route
app.post('/api/create-new-table',authenticateToken,express.json(),createNewTable );
app.post('/api/get-table',authenticateToken,express.json(),getTableDetailsById );
app.post('/api/get-table-fields',authenticateToken,express.json(),getSpecificTableField );

app.post('/api/save-dynamic-table-data',authenticateToken,express.json(),dynamicFileUpload.single("file"),saveDynamicTableData );

app.post('/api/upload-document',authenticateToken,express.json(), dynamicFileUpload.single("file"),uploadDocument );

// profile controller

app.post('/api/org-profile',authenticateToken,express.json(),upload,orgProfileSaveUpdate );
app.post('/api/org-profile-list',authenticateToken,express.json(),getOrgProfileList );
app.post('/api/org-profile-details',authenticateToken,express.json(),getOrgProfileDetails );
app.post('/api/org-profile-documents',authenticateToken,express.json(),getOrgProfileDocuments );

// customer controller
app.post('/api/customer-save-update',authenticateToken,express.json(),upload,customerSaveUpdate );
app.post('/api/customers',authenticateToken,express.json(),getCustomerList );
app.post('/api/customer',authenticateToken,express.json(),getCustomerDetails );
app.post('/api/customer/documents',authenticateToken,express.json(),getCustomerDocuments );
app.post('/api/customer/contact/delete',authenticateToken,express.json(),deleteCustomerContact );
//end customer controller

app.post('/api/quotation-save-update',authenticateToken,express.json(),upload,quotationSaveUpdate );
app.post('/api/quotations',authenticateToken,express.json(),getQuotationList );
app.post('/api/quotation',authenticateToken,express.json(),getQuotationDetails );
app.post('/api/quotation/documents',authenticateToken,express.json(),getQuotationDocuments );
app.post('/api/quotation/item/delete',authenticateToken,express.json(),deleteQuotationItem );
app.post('/api/quotation/status',authenticateToken,express.json(),getQuotationStatus );
app.post('/api/quotation/change/status',authenticateToken,express.json(),quotationChangeStatus );
//end quotation controller

app.post('/api/employee-save-update',authenticateToken,express.json(),upload,employeeSaveUpdate );
app.post('/api/employees',authenticateToken,express.json(),getEmployeeList );
app.post('/api/employee',authenticateToken,express.json(),getEmployeeDetails );
app.post('/api/employee/documents',authenticateToken,express.json(),getEmployeeDocuments );
app.post('/api/employee/item/delete',authenticateToken,express.json(),deleteEmployeeItem );
app.post('/api/employee/status',authenticateToken,express.json(),getEmployeeStatus );
app.post('/api/employee/change/status',authenticateToken,express.json(),employeeChangeStatus );
app.post('/api/employee/leave/save-update',authenticateToken,express.json(),upload,employeeLeaveSaveUpdate);
app.post('/api/employee/leaves',authenticateToken,express.json(),getEmployeeLeavesList);
app.post('/api/employee/leave',authenticateToken,express.json(),getEmployeeLeaveDetails );
app.post('/api/employee/leave/types',authenticateToken,express.json(),getEmployeeLeaveTypes );
app.post('/api/employee/deduction/save-update',authenticateToken,express.json(),upload,employeeDeductionSaveUpdate );

app.post('/api/employee/exit-clearance/save-update',authenticateToken,express.json(),upload,employeeExitClearanceSaveUpdate);
app.post('/api/employee/exit-clearances',authenticateToken,express.json(),getEmployeeExitClearanceList);
app.post('/api/employee/exit-clearance',authenticateToken,express.json(),getEmployeeExitClearanceDetails );


app.post('/api/attendance/save-update',authenticateToken,express.json(),upload,attendanceSaveUpdate );
app.post('/api/employee/attendance',authenticateToken,express.json(),getAttendanceList ); 
app.post('/api/employee/payslip',authenticateToken,express.json(),getPaySlip ); 


//end employee controller

app.post('/api/payroll/salary-component/save-update',authenticateToken,express.json(),upload,salaryComponentSaveUpdate );
app.post('/api/payroll/salary-components',authenticateToken,express.json(),getSalaryComponentList );
app.post('/api/payroll/salary-component',authenticateToken,express.json(),getSalaryComponentDetails );

app.post('/api/payroll/salary-component/benefits/save-update',authenticateToken,express.json(),upload,salaryComponentBenefitSaveUpdate );
app.post('/api/payroll/salary-components/benefits',authenticateToken,express.json(),getSalaryComponentBenefitsList );
app.post('/api/payroll/salary-component/benefit',authenticateToken,express.json(),getSalaryComponentBenefitDetails );

app.post('/api/payroll/salary-component/deductions/save-update',authenticateToken,express.json(),upload,salaryComponentDeductionSaveUpdate );
app.post('/api/payroll/salary-components/deductions',authenticateToken,express.json(),getSalaryComponentDeductionsList );
app.post('/api/payroll/salary-components/deduction',authenticateToken,express.json(),getSalaryComponentDeductionDetails );

app.post('/api/payroll/summary',authenticateToken,express.json(),getPayrollSummary );
app.post('/api/payroll/preview',authenticateToken,express.json(),getPayrollPreview );
app.post('/api/payroll/accrual/preview',authenticateToken,express.json(),getPayrollAccrualPreview );
app.post('/api/payroll/history',authenticateToken,express.json(),getPayrollHistory );
 
app.post('/api/payroll/save',authenticateToken,express.json(),payrollSave );

// start of finance 

app.post('/api/coa/save-update',authenticateToken,express.json(),upload,coaSaveUpdate );
app.post('/api/chart-of-accounts',authenticateToken,express.json(),getCOAList );
app.post('/api/chart-of-account',authenticateToken,express.json(),getCOADetails );

app.post('/api/coa/account-types',authenticateToken,express.json(),getCOAAcountTypes );







const port = process.env.PORT || 3000;

// app.listen(port,()=>{
//     console.log('server has started');
// })

const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});


// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    server.close(() => {
        console.log('Closed all connections');
        process.exit(0);
    });
});


