const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const sql = require("mssql");
const router = express.Router(); 
const cors = require("cors");
const authenticateToken = require('./middleware');   
const multer = require("multer"); 
// Import the socket server logic
const { initSocketServer } = require("./socket/socketServer");


const {uploadDocument,getDynamicCreatedTablesWithModules,getMainModules,createNewTable, getDynamicCreatedTables,getTableDetailsById,getSpecificTableField,saveDynamicTableData} = require('./controllers/createNewTableController')
const {signUp, tenantCreation,userCreation,sendOTP,varifyOTP,getAuditLog,signIn,tenantSignIn} = require('./controllers/authController'); 

const {branchSaveUpdate,getBranchDetails,getBranchesList,orgProfileSaveUpdate,getOrgProfileList,getOrgProfileDetails,getOrgProfileDocuments} = require('./controllers/profileController'); 
const {customerSaveUpdate,deleteCustomerContact,getCustomerList,getCustomerDetails,getCustomerDocuments} = require('./controllers/customerController'); 
const {approvalWorkFlowSaveUpdate,getApprovalWorkFlowDetails,getApprovalWorkFlowsList} = require('./controllers/approvalWorkFlowController'); 

const {quotationChangeStatus,getQuotationStatus,quotationSaveUpdate,deleteQuotationItem,getQuotationList,getQuotationDetails,getQuotationDocuments} = require('./controllers/quotationController'); 
const {salaryAdjustmentChangeStatus,getSalaryAdjustmentSchedule,getSalaryAdjustments,employeeSalaryAdjustmentSaveUpdate,getEmployeeReportAbscondingDocuments,getEmployeeReportAbscondingDetails,getEmployeeReportAbscondingList,employeeReportAbscondingSaveUpdate,getOutsourcedEmployees,outsourcedEmployeeSaveUpdate,getEmployeeRevisions,employeeRevisionSaveUpdate,employeeOneTimeAllowances,employeeDeductions,employeePayslips,employeeDeleteDeductionOrAllowance,employeeDeleteDocument,getPaySlip,getEmployeeExitClearanceDetails,getEmployeeExitClearanceList,employeeExitClearanceSaveUpdate,employeeOneTimeAllowanceSaveUpdate,employeeDeductionSaveUpdate,getEmployeeLeaveTypes,getEmployeeLeavesList,getEmployeeLeaveDetails,employeeLeaveSaveUpdate,employeeChangeStatus,getEmployeeStatus,employeeSaveUpdate,deleteEmployeeItem,getEmployeeList,getEmployeeDetails,getEmployeeDocuments} = require('./controllers/employeeController'); 
const {saveEmployeeEOS,releaseEmployeeEOS,releaseEmployeeSalary,holdEmployeeSalary,getPayrollConfiguration,payrollConfigurationSave,payrollSave,getPayrollHistory,getPayrollAccrualPreview,getPayrollPreview,getPayrollEmployeeDetails,getPayrollSummary,salaryComponentSaveUpdate,getSalaryComponentList,getSalaryComponentDetails,getSalaryComponentBenefitDetails,getSalaryComponentBenefitsList,salaryComponentBenefitSaveUpdate,getSalaryComponentDeductionDetails,getSalaryComponentDeductionsList,salaryComponentDeductionSaveUpdate} = require('./controllers/payrollController'); 
const {coaAllocationSaveUpdate,getCOAAllocations,getCOAAllocationDetails, getCOAAcountTypes,coaSaveUpdate,createDefaultCOASaveUpdate,coaSaveUpdateNew,getCOAList,getCOAListNew,getCOADetails,deleteCOAAccount} = require('./controllers/finance/coaController'); 
const {getEmployeeProjectWiseReport,getAttendanceReport,employeeAttendanceMasterSaveUpdate,attendanceSaveUpdate,getAttendanceList,getAttendanceMasterList} = require('./controllers/hr/attendanceController'); 
const {shiftSaveUpdate,getShiftDetails,getShiftsList} = require('./controllers/hr/shiftController'); 

const {getfinancialPeriodLocks,financialPeriodLockSave,financeConfigurationSave,getFinanceConfiguration} = require('./controllers/finance/financeConfigurationController'); 


const {getAttendanceContractLocationsList,getAttendanceContractsList,getContractLocations,getLocationDetails,locationSaveUpdate,getPropertyDetails,propertySaveUpdate,projectSaveUpdate,contractSaveUpdate,getContractDetails,getProjectDetails,getContractsList} = require('./controllers/contract/contractController'); 
const {vendorSaveUpdate,getVendorDetails,getVendorsList} = require('./controllers/procurement/vendorController'); 
const {itemSaveUpdate,getItemDetails,getItemsList,getItemVariationsList,getItemsWithVariations} = require('./controllers/procurement/itemController'); 
const {prSaveUpdate,getPRDetails,getPRItems,getPRsList} = require('./controllers/procurement/prController'); 
const {poSaveUpdate,getPODetails,getGRNPOItems,getPOItems,deletePOItem,getPOsList,getPurchaseReport} = require('./controllers/procurement/poController'); 
const {rfqSaveUpdate,getRFQDetails,getRFQsList,rfqChangeStatus,getRFQPOsList,deleteRFQItem} = require('./controllers/procurement/rfqController'); 
const {grnSaveUpdate,getGRNDetails,getGRNItems,getGRNsList,getPOPreviousGRns} = require('./controllers/procurement/grnController'); 
const {getInventoryGRNItems} = require('./controllers/procurement/inventoryController'); 
const {warehouseSaveUpdate,getWarehouseDetails,getWarehousesList} = require('./controllers/procurement/warehouseController'); 
const {crmLeadSaveUpdate,saveOrUpdateLeadStatusHistory,saveOrUpdateOpportunityStatusHistory,leadCallLogSaveOrUpdate,CRMEmailSaveOrUpdate,leadNoteSaveOrUpdate,leadMeetingSaveOrUpdate,opportunitysaveUpdate,getCRMOpportunity,getCRMOpportunityDetails,crmAccountSaveUpdate,crmContactSaveUpdate,getCRMAccount,getCRMContact,getCRMLeadDetails,getCRMLeadActivities,getCRMLeadsList} = require('./controllers/crm/crmLeadController'); 


const {contactSaveUpdate,becomePartnerSaveUpdate} = require('./controllers/homeController'); 
const {getVatSettingsDetails,vatSettingsSaveUpdate,journalEntrySaveUpdate,getJournalEntrysList,getJournalLedgers,getTrailBalance,getProfitAndLoss,getBalanceSheet,getCustomerInvoiceAging,getVatReturns,getVatReturnsDetails,getBankTransections,getJournalEntryDetails} = require('./controllers/finance/JournalEntryController'); 
const {getTaxRate,getOrdersForInvoice,invoiceSaveUpdate,getInvoicesList,getInvoiceDetails,getCustomerInvoice} = require('./controllers/finance/invoiceController'); 
const {getAppliedCreditInvoicesList,deleteAppliedInvoiceFromCreditNote, applycreditNoteOnInvoice,creditNoteSaveUpdate,getCreditNotesList,getCreditNoteDetails} = require('./controllers/finance/creditNoteController'); 

const {deleteAppliedBillFromCreditNote,getAppliedVendorCreditInvoicesList, applyVendorCreditNoteOnInvoice,vendorCreditNoteSaveUpdate,getVendorCreditNotesList,getVendorCreditNoteDetails} = require('./controllers/finance/vendorCreditNoteController'); 
const {getExpensesList,expenseSaveUpdate,getExpenseDetails,getPettyCashDetails,getPettyCashExpensesList} = require('./controllers/finance/expenseController'); 

const {getFinAdditionalFieldsList,finAdditionalFieldSaveUpdate,getFinAdditionalFieldDetails} = require('./controllers/finance/finAdditionalFieldController'); 
const {getBanksList,bankSaveUpdate,getBankDetails} = require('./controllers/finance/bankController'); 
const {costCenterTypeSaveUpdate,getCostCenterTypeDetails,getCostCenterTypesList,getCostCentersList,costCenterSaveUpdate,getCostCenterDetails} = require('./controllers/finance/costCenterController'); 

const {supplierBillSaveUpdate,getSupplierBillsList,getSupplierBillDetails} = require('./controllers/finance/supplierBillController'); 
const {makePaymentSaveUpdate,getMakePaymentsList,getMakePaymentDetails} = require('./controllers/finance/makePaymentController'); 


const {paymentSaveUpdate,getPaymentsList,getPaymentDetails,getCustomerPayment} = require('./controllers/finance/receiveablePaymentController'); 

// user roles

const {transactionAccessSaveOrUpdate,getTransectionAccessDetails,getTransectionAccesssList,getAllTransectionAccessWithPermissions} = require('./controllers/UserRole/transectionAccessSetupController'); 

const {roleSaveOrUpdate,assignRoleToUser,setUserModuleMenuConfig,getRoleDetails,getRolesList,getUsersRolesList,getUserPermissions} = require('./controllers/UserRole/roleController'); 

const {getProfitAndLossDashboard,getAgingDashboard} = require('./controllers/dashboardController'); 


const {laundryItemSaveUpdate,  laundryServiceSaveUpdate,  laundryOrderSaveUpdate,laundryChangeOrderStatus,  laundryOrderItemSaveUpdate,
    getLaundryItems,getLaundryCustomerDetails,deleteOrderItem,  getLaundryServices,  getLaundryPriceList, getLaundryOrders,getLaundryOrderDetails,  getLaundryOrderItems
} = require('./controllers/laundry/laundryController'); 

const {getAppsList,tenantModuleSubscription} = require('./controllers/tenantController'); 


 
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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
    limits: { 
        fileSize: 10 * 1024 * 1024,  
        fieldSize: 10 * 1024 * 1024 
    } 
}).fields([
    { name: "logo", maxCount: 1 },
    { name: "img", maxCount: 1 }, 
    { name: "attachments", maxCount: 5 }
]);

const expenseUpload = multer({
  storage: storage,
  limits: { 
      fileSize: 10 * 1024 * 1024,
      fieldSize: 10 * 1024 * 1024
  }
}).any();

const employeeUpload = multer({
    storage: storage,
    limits: { 
        fileSize: 10 * 1024 * 1024,
        fieldSize: 10 * 1024 * 1024  
    }
}).any(); 



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
app.post('/api/tenant-signin',express.json(),tenantSignIn );




app.post('/api/tenant/account-creation',express.json(),tenantCreation );
app.post('/api/all-apps',authenticateToken,express.json(),getAppsList);
app.post('/api/tenant/app-subscription',authenticateToken,express.json(),tenantModuleSubscription);





app.post('/api/send-otp',express.json(),upload,sendOTP );

app.post('/api/varify-otp',express.json(),varifyOTP );
 
app.post('/api/audit-logs',authenticateToken,express.json(),upload,getAuditLog );



app.post('/api/contact-info/save-update',express.json(),upload,contactSaveUpdate );
app.post('/api/become-partner/save-update',express.json(),upload,becomePartnerSaveUpdate );



app.get('/users',authenticateToken,getDynamicCreatedTables);
app.post('/api/get-all-dynamics-tables',authenticateToken,express.json(),getDynamicCreatedTables);
app.post('/api/get-main-modules',authenticateToken,express.json(),getMainModules);
app.post('/api/modules-dynamic-screens',authenticateToken,express.json(),getDynamicCreatedTablesWithModules);


 
//  ----------- public url


app.post('/api/create-new-table',authenticateToken,express.json(),createNewTable );
app.post('/api/get-reference',express.json(),getTableDetailsById );
app.post('/api/get-reference-fields',authenticateToken,express.json(),getSpecificTableField );

app.post('/api/save-dynamic-table-data',authenticateToken,express.json(),dynamicFileUpload.single("file"),saveDynamicTableData );

app.post('/api/upload-document',authenticateToken,express.json(), dynamicFileUpload.single("file"),uploadDocument );

// profile controller

app.post('/api/org-profile',authenticateToken,express.json(),upload,orgProfileSaveUpdate );
app.post('/api/org-profile-list',authenticateToken,express.json(),getOrgProfileList );
app.post('/api/org-profile-details',authenticateToken,express.json(),getOrgProfileDetails );
app.post('/api/org-profile-documents',authenticateToken,express.json(),getOrgProfileDocuments );

// branch
app.post('/api/branch/save-update',authenticateToken,express.json(),upload,branchSaveUpdate );
app.post('/api/branch',authenticateToken,express.json(),getBranchDetails );
app.post('/api/branches',authenticateToken,express.json(),getBranchesList );

// customer controller
app.post('/api/customer-save-update',authenticateToken,express.json(),upload,customerSaveUpdate );
app.post('/api/customers',authenticateToken,express.json(),getCustomerList );
app.post('/api/customer',authenticateToken,express.json(),getCustomerDetails );
app.post('/api/customer/documents',authenticateToken,express.json(),getCustomerDocuments );
app.post('/api/customer/contact/delete',authenticateToken,express.json(),deleteCustomerContact );
//end customer controller

// approvel work flow
app.post('/api/approvalmanagement/save-update',authenticateToken,express.json(),upload,approvalWorkFlowSaveUpdate );
app.post('/api/approvalmanagements',authenticateToken,express.json(),getApprovalWorkFlowsList );
app.post('/api/approvalmanagement',authenticateToken,express.json(),getApprovalWorkFlowDetails );


app.post('/api/contract/save-update',authenticateToken,express.json(),upload,contractSaveUpdate ); 

app.post('/api/contract',authenticateToken,express.json(),getContractDetails );
app.post('/api/contracts',authenticateToken,express.json(),getContractsList );
app.post('/api/attendance/contracts',authenticateToken,express.json(),getAttendanceContractsList );
app.post('/api/attendance/contract/locations',authenticateToken,express.json(),getAttendanceContractLocationsList );

app.post('/api/project/save-update',authenticateToken,express.json(),upload,projectSaveUpdate ); 
app.post('/api/project',authenticateToken,express.json(),getProjectDetails );
 
app.post('/api/property/save-update',authenticateToken,express.json(),upload,propertySaveUpdate ); 
app.post('/api/property',authenticateToken,express.json(),getPropertyDetails );
app.post('/api/properties',authenticateToken,express.json(),getPropertyDetails );
 

app.post('/api/location/save-update',authenticateToken,express.json(),upload,locationSaveUpdate ); 
app.post('/api/location',authenticateToken,express.json(),getLocationDetails );
app.post('/api/locations',authenticateToken,express.json(),getLocationDetails );

app.post('/api/contract/locations',authenticateToken,express.json(),getContractLocations );


 


//end contract controller


app.post('/api/vendor/save-update',authenticateToken,express.json(),upload,vendorSaveUpdate ); 
app.post('/api/vendor',authenticateToken,express.json(),getVendorDetails );
app.post('/api/vendors',authenticateToken,express.json(),getVendorsList );
 
//end vendor controller

app.post('/api/item/save-update',authenticateToken,express.json(),upload,itemSaveUpdate ); 
app.post('/api/item',authenticateToken,express.json(),getItemDetails );
app.post('/api/items',express.json(),authenticateToken,getItemsList );
app.post('/api/item/variations',express.json(),getItemVariationsList );
app.post('/api/items-variations',express.json(),getItemsWithVariations );

 
//end item controller

app.post('/api/pr/save-update',authenticateToken,express.json(),upload,prSaveUpdate ); 
app.post('/api/pr',authenticateToken,express.json(),getPRDetails );
app.post('/api/pr-items',authenticateToken,express.json(),getPRItems );

app.post('/api/prs',authenticateToken,express.json(),getPRsList );
//end pr controller
 
app.post('/api/po/save-update',authenticateToken,express.json(),upload,poSaveUpdate ); 
app.post('/api/po',authenticateToken,express.json(),getPODetails );
app.post('/api/po-items',authenticateToken,express.json(),getPOItems );
app.post('/api/po-item/delete',authenticateToken,express.json(),deletePOItem );
app.post('/api/grn/po-items',authenticateToken,express.json(),getGRNPOItems );

app.post('/api/pos',authenticateToken,express.json(),getPOsList );
app.post('/api/procurement/purchase-report',authenticateToken,express.json(),getPurchaseReport );
//end po controller

// inventory

app.post('/api/inventory/grn-items',authenticateToken,express.json(),getInventoryGRNItems );

// end of inventory

// warehouse
app.post('/api/warehouse/save-update',authenticateToken,express.json(),upload,warehouseSaveUpdate ); 
app.post('/api/warehouse',authenticateToken,express.json(),getWarehouseDetails );
app.post('/api/warehouses',authenticateToken,express.json(),getWarehousesList );

// end of warehouse

app.post('/api/crm-lead/save-update',authenticateToken,express.json(),upload,crmLeadSaveUpdate ); 
app.post('/api/crm-lead',authenticateToken,express.json(),getCRMLeadDetails );
app.post('/api/crm-lead/activities',authenticateToken,express.json(),getCRMLeadActivities );

app.post('/api/crm-leads',authenticateToken,express.json(),getCRMLeadsList );
app.post('/api/crm-lead/change-status',authenticateToken,express.json(),upload,saveOrUpdateLeadStatusHistory ); 
app.post('/api/crm-lead/log-call/save-update',authenticateToken,express.json(),upload,leadCallLogSaveOrUpdate ); 
app.post('/api/crm-lead/note/save-update',authenticateToken,express.json(),upload,leadNoteSaveOrUpdate ); 
app.post('/api/crm-lead/schedule-meeting/save-update',authenticateToken,express.json(),upload,leadMeetingSaveOrUpdate ); 
app.post('/api/crm-lead/email/save-update',authenticateToken,express.json(),upload,CRMEmailSaveOrUpdate ); 

app.post('/api/crm-opportunity/save-update',authenticateToken,express.json(),upload,opportunitysaveUpdate ); 


app.post('/api/crm-opportunity',authenticateToken,express.json(),getCRMOpportunityDetails );
app.post('/api/crm-opportunities',authenticateToken,express.json(),getCRMOpportunity );


app.post('/api/crm-opportunity/change-status',authenticateToken,express.json(),upload,saveOrUpdateOpportunityStatusHistory ); 


app.post('/api/crm-account/save-update',authenticateToken,express.json(),upload,crmAccountSaveUpdate ); 
app.post('/api/crm-account',authenticateToken,express.json(),getCRMAccount );
app.post('/api/crm-accounts',authenticateToken,express.json(),getCRMAccount );


app.post('/api/crm-contact/save-update',authenticateToken,express.json(),upload,crmContactSaveUpdate ); 
app.post('/api/crm-contact',authenticateToken,express.json(),getCRMContact );
app.post('/api/crm-contacts',authenticateToken,express.json(),getCRMContact );






// end of crm-lead


// rfq
app.post('/api/rfq/save-update',authenticateToken,express.json(),upload,rfqSaveUpdate ); 
app.post('/api/rfq',authenticateToken,express.json(),getRFQDetails );
app.post('/api/rfqs',authenticateToken,express.json(),getRFQsList );
app.post('/api/rfq/pos',authenticateToken,express.json(),getRFQPOsList );
app.post('/api/rfq-item/delete',authenticateToken,express.json(),deleteRFQItem );
app.post('/api/rfq/change-status',authenticateToken,express.json(),rfqChangeStatus );
 



app.post('/api/grn/save-update',authenticateToken,express.json(),upload,grnSaveUpdate ); 
app.post('/api/grn',authenticateToken,express.json(),getGRNDetails );
app.post('/api/grn-items',authenticateToken,express.json(),getGRNItems );

app.post('/api/grns',authenticateToken,express.json(),getGRNsList );
app.post('/api/po/previous-grns',authenticateToken,express.json(),getPOPreviousGRns );

//end GRN controller
 

 

app.post('/api/quotation-save-update',authenticateToken,express.json(),upload,quotationSaveUpdate );
app.post('/api/quotations',authenticateToken,express.json(),getQuotationList );
app.post('/api/quotation',authenticateToken,express.json(),getQuotationDetails );
app.post('/api/quotation/documents',authenticateToken,express.json(),getQuotationDocuments );
app.post('/api/quotation/item/delete',authenticateToken,express.json(),deleteQuotationItem );
app.post('/api/quotation/status',authenticateToken,express.json(),getQuotationStatus );
app.post('/api/quotation/change/status',authenticateToken,express.json(),quotationChangeStatus );
//end quotation controller

app.post('/api/employee-save-update',authenticateToken,express.json(),employeeUpload,employeeSaveUpdate );
app.post('/api/outsourced-employee/save-update',authenticateToken,express.json(),employeeUpload,outsourcedEmployeeSaveUpdate );
app.post('/api/employee/outsourced',authenticateToken,express.json(),getOutsourcedEmployees );

app.post('/api/employee/revision/save-update',authenticateToken,express.json(),upload,employeeRevisionSaveUpdate );
app.post('/api/employee/revisions',authenticateToken,express.json(),getEmployeeRevisions );

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
app.post('/api/employee/one-time-allowance/save-update',authenticateToken,express.json(),upload,employeeOneTimeAllowanceSaveUpdate );
app.post('/api/employee/delete/document',authenticateToken,express.json(),employeeDeleteDocument );
app.post('/api/employee/delete/deduction-allowance',authenticateToken,express.json(),employeeDeleteDeductionOrAllowance );


app.post('/api/employee/payslips',authenticateToken,express.json(),employeePayslips );
app.post('/api/employee/deductions',authenticateToken,express.json(),employeeDeductions );
app.post('/api/employee/one-time-allowances',authenticateToken,express.json(),employeeOneTimeAllowances );
app.post('/api/employee/salary-adjustment/save-update',authenticateToken,express.json(),upload,employeeSalaryAdjustmentSaveUpdate );
app.post('/api/employee/salary-adjustments',authenticateToken,express.json(),getSalaryAdjustments );
app.post('/api/employee/salary-adjustment/schedule',authenticateToken,express.json(),getSalaryAdjustmentSchedule );
app.post('/api/employee/salary-adjustment/change-status',authenticateToken,express.json(),salaryAdjustmentChangeStatus );




app.post('/api/employee/exit-clearance/save-update',authenticateToken,express.json(),upload,employeeExitClearanceSaveUpdate);
app.post('/api/employee/exit-clearances',authenticateToken,express.json(),getEmployeeExitClearanceList);
app.post('/api/employee/exit-clearance',authenticateToken,express.json(),getEmployeeExitClearanceDetails );


app.post('/api/employee/report-absconding/save-update',authenticateToken,express.json(),upload,employeeReportAbscondingSaveUpdate);
app.post('/api/employee/report-abscondings',authenticateToken,express.json(),getEmployeeReportAbscondingList);
app.post('/api/employee/report-absconding',authenticateToken,express.json(),getEmployeeReportAbscondingDetails );
app.post('/api/employee/report-absconding/documents',authenticateToken,express.json(),getEmployeeReportAbscondingDocuments );



app.post('/api/attendance/save-update',authenticateToken,express.json(),upload,attendanceSaveUpdate );
app.post('/api/employee-attendance-master/save-update',authenticateToken,express.json(),upload,employeeAttendanceMasterSaveUpdate );
app.post('/api/employee/attendance-master',authenticateToken,express.json(),getAttendanceMasterList ); 
app.post('/api/employee/attendance',authenticateToken,express.json(),getAttendanceList ); 
app.post('/api/employee/payslip',authenticateToken,express.json(),getPaySlip ); 
app.post('/api/employee/attendance/report',authenticateToken,express.json(),getAttendanceReport ); 
app.post('/api/employee/project-wise/report',authenticateToken,express.json(),getEmployeeProjectWiseReport ); 



app.post('/api/attendance/shift/save-update',authenticateToken,express.json(),upload,shiftSaveUpdate );
app.post('/api/attendance/shift',authenticateToken,express.json(),getShiftDetails ); 
app.post('/api/attendance/shifts',authenticateToken,express.json(),getShiftsList ); 



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
app.post('/api/payroll/employee',authenticateToken,express.json(),getPayrollEmployeeDetails );
app.post('/api/payroll/hold-salary',authenticateToken,express.json(),upload,holdEmployeeSalary );
app.post('/api/payroll/release-salary',authenticateToken,express.json(),upload,releaseEmployeeSalary );
app.post('/api/payroll/eos-save',authenticateToken,express.json(),upload,saveEmployeeEOS );
app.post('/api/payroll/release-eos',authenticateToken,express.json(),upload,releaseEmployeeEOS );



app.post('/api/payroll/accrual/preview',authenticateToken,express.json(),getPayrollAccrualPreview );
app.post('/api/payroll/history',authenticateToken,express.json(),getPayrollHistory );
 
app.post('/api/payroll/save',authenticateToken,express.json(),payrollSave );
app.post('/api/payroll/configuration/save-update',authenticateToken,express.json(),upload,payrollConfigurationSave );
app.post('/api/payroll/configuration',authenticateToken,express.json(),getPayrollConfiguration );

// start of finance 

app.post('/api/finance/configuration/save-update',authenticateToken,express.json(),upload,financeConfigurationSave );
app.post('/api/finance/configuration',authenticateToken,express.json(),getFinanceConfiguration );

app.post('/api/finance/period-locking/save-update',authenticateToken,express.json(),upload,financialPeriodLockSave );
app.post('/api/finance/period-locking',authenticateToken,express.json(),getfinancialPeriodLocks );


app.post('/api/coa/save-update',authenticateToken,express.json(),upload,coaSaveUpdate );
app.post('/api/coa/save-update/multiple',authenticateToken,express.json(),upload,coaSaveUpdateNew );
app.post('/api/coa/default-coa/save-update',authenticateToken,express.json(),upload,createDefaultCOASaveUpdate );


app.post('/api/chart-of-accounts/formated',authenticateToken,express.json(),getCOAListNew );

app.post('/api/chart-of-accounts',authenticateToken,express.json(),getCOAList ); 

app.post('/api/chart-of-account',authenticateToken,express.json(),getCOADetails );
app.post('/api/chart-of-account/delete',authenticateToken,express.json(),deleteCOAAccount );

app.post('/api/coa/account-types',authenticateToken,express.json(),getCOAAcountTypes );

app.post('/api/coa/allocation/save-update',authenticateToken,express.json(),upload,coaAllocationSaveUpdate );
app.post('/api/coa/allocations',authenticateToken,express.json(),upload,getCOAAllocations );
app.post('/api/coa/allocation',authenticateToken,express.json(),upload,getCOAAllocationDetails );



app.post('/api/finance/journal-entry/save-update',authenticateToken,express.json(),upload,journalEntrySaveUpdate );
app.post('/api/finance/journal-entries',authenticateToken,express.json(),getJournalEntrysList );
app.post('/api/finance/journal-entry',authenticateToken,express.json(),getJournalEntryDetails );
app.post('/api/finance/journal-ledger',authenticateToken,express.json(),getJournalLedgers );
app.post('/api/finance/trail-balance',authenticateToken,express.json(),getTrailBalance );
app.post('/api/finance/p-and-l',authenticateToken,express.json(),getProfitAndLoss );
app.post('/api/finance/balance-sheet',authenticateToken,express.json(),getBalanceSheet );

app.post('/api/finance/aging',authenticateToken,express.json(),getCustomerInvoiceAging );


app.post('/api/finance/vat-returns/details',authenticateToken,express.json(),getVatReturnsDetails );
app.post('/api/finance/bank-transections',authenticateToken,express.json(),getBankTransections );
app.post('/api/finance/vat-settings/save-update',authenticateToken,express.json(),upload,vatSettingsSaveUpdate );
app.post('/api/finance/vat-settings',authenticateToken,express.json(),upload,getVatSettingsDetails );
app.post('/api/finance/vat-returns',authenticateToken,express.json(),upload,getVatReturns );





app.post('/api/finance/credit-note/save-update',authenticateToken,express.json(),upload,creditNoteSaveUpdate );
app.post('/api/finance/credit-note/apply/invoice',authenticateToken,express.json(),upload,applycreditNoteOnInvoice );

app.post('/api/finance/credit-notes',authenticateToken,express.json(),getCreditNotesList );
app.post('/api/finance/credit-note',authenticateToken,express.json(),getCreditNoteDetails );

app.post('/api/finance/credit-note/applied/invoices',authenticateToken,express.json(),getAppliedCreditInvoicesList );
app.post('/api/finance/credit-note/delete-invoice',authenticateToken,express.json(),deleteAppliedInvoiceFromCreditNote );
// end of credit note



app.post('/api/finance/vendor-credit-note/save-update',authenticateToken,express.json(),upload,vendorCreditNoteSaveUpdate );
app.post('/api/finance/vendor-credit-note/apply/bill',authenticateToken,express.json(),upload,applyVendorCreditNoteOnInvoice );

app.post('/api/finance/vendor-credit-notes',authenticateToken,express.json(),getVendorCreditNotesList );
app.post('/api/finance/vendor-credit-note',authenticateToken,express.json(),getVendorCreditNoteDetails );

app.post('/api/finance/vendor-credit-note/applied/bills',authenticateToken,express.json(),getAppliedVendorCreditInvoicesList );
app.post('/api/finance/credit-note/delete-bill',authenticateToken,express.json(),deleteAppliedBillFromCreditNote );


// end of vendor credit note

app.post('/api/finance/expense/save-update',authenticateToken,express.json(),expenseUpload,expenseSaveUpdate );
app.post('/api/finance/expenses',authenticateToken,express.json(),getExpensesList );
app.post('/api/finance/expense',authenticateToken,express.json(),getExpenseDetails );
app.post('/api/finance/pettycash',authenticateToken,express.json(),getPettyCashDetails );
app.post('/api/finance/pettycash-expenses',authenticateToken,express.json(),getPettyCashExpensesList );


app.post('/api/finance/supplier-bill/save-update',authenticateToken,express.json(),upload,supplierBillSaveUpdate );
app.post('/api/finance/supplier-bills',authenticateToken,express.json(),getSupplierBillsList );
app.post('/api/finance/supplier-bill',authenticateToken,express.json(),getSupplierBillDetails );
// end of supplier bill


app.post('/api/finance/make-payment/save-update',authenticateToken,express.json(),upload,makePaymentSaveUpdate );
app.post('/api/finance/make-payments',authenticateToken,express.json(),getMakePaymentsList );
app.post('/api/finance/make-payment',authenticateToken,express.json(),getMakePaymentDetails );
// end of make payment




app.post('/api/finance/invoice/save-update',authenticateToken,express.json(),upload,invoiceSaveUpdate );
app.post('/api/finance/invoices',authenticateToken,express.json(),getInvoicesList );
app.post('/api/finance/invoice',authenticateToken,express.json(),getInvoiceDetails );
app.post('/api/finance/customer/invoices',authenticateToken,express.json(),getCustomerInvoice );

app.post('/api/finance/tax-rate',authenticateToken,express.json(),getTaxRate );

app.post('/api/finance/received-payment/save-update',authenticateToken,express.json(),upload,paymentSaveUpdate );
app.post('/api/finance/received-payments',authenticateToken,express.json(),getPaymentsList );
app.post('/api/finance/received-payment',authenticateToken,express.json(),getPaymentDetails ); 

app.post('/api/finance/invoice-orders',authenticateToken,express.json(),getOrdersForInvoice );


// end of received payment

app.post('/api/finance/additionalfield/save-update',authenticateToken,express.json(),upload,finAdditionalFieldSaveUpdate );
app.post('/api/finance/additionalfields',authenticateToken,express.json(),getFinAdditionalFieldsList );
app.post('/api/finance/additionalfield',authenticateToken,express.json(),getFinAdditionalFieldDetails );
// end of fin additional field


app.post('/api/finance/bank/save-update',authenticateToken,express.json(),upload,bankSaveUpdate );
app.post('/api/finance/banks',authenticateToken,express.json(),getBanksList );
app.post('/api/finance/bank',authenticateToken,express.json(),getBankDetails );
// end of bank

app.post('/api/finance/cost-center/save-update',authenticateToken,express.json(),upload,costCenterSaveUpdate );
app.post('/api/finance/cost-centers',authenticateToken,express.json(),getCostCentersList );
app.post('/api/finance/cost-center',authenticateToken,express.json(),getCostCenterDetails );
// end of costCenter

app.post('/api/finance/cost-center/type/save-update',authenticateToken,express.json(),upload,costCenterTypeSaveUpdate );
app.post('/api/finance/cost-center/types',authenticateToken,express.json(),getCostCenterTypesList );
app.post('/api/finance/cost-center/type',authenticateToken,express.json(),getCostCenterTypeDetails );

// end of costCenter type

// dashbaord

app.post('/api/dashboard/p-and-l',authenticateToken,express.json(),getProfitAndLossDashboard ); 
app.post('/api/dashboard/aging',authenticateToken,express.json(),getAgingDashboard ); 





// user roles

app.post('/api/users/save-update',authenticateToken,express.json(),upload,userCreation );


app.post('/api/role/transection-access-setup/save-update',authenticateToken,express.json(),upload,transactionAccessSaveOrUpdate );
app.post('/api/role/transection-access-setups',authenticateToken,express.json(),getTransectionAccesssList );
app.post('/api/role/transection-access-setup',authenticateToken,express.json(),getTransectionAccessDetails );
app.post('/api/role/transection-accesses',authenticateToken,express.json(),getAllTransectionAccessWithPermissions );


app.post('/api/role/save-update',authenticateToken,express.json(),upload,roleSaveOrUpdate );
app.post('/api/role/assign-to-user',authenticateToken,express.json(),upload,assignRoleToUser );
app.post('/api/user/config-module-menu',authenticateToken,express.json(),upload,setUserModuleMenuConfig );


app.post('/api/role',authenticateToken,express.json(),getRoleDetails );
app.post('/api/roles',authenticateToken,express.json(),getRolesList );
app.post('/api/role/users-roles',authenticateToken,express.json(),getUsersRolesList );
app.post('/api/role/users-permissions',authenticateToken,express.json(),getUserPermissions );


 




app.post('/api/laundry/order/save-update',express.json(),upload,laundryOrderSaveUpdate ); 
app.post('/api/laundry/order/change-status',express.json(),upload,laundryChangeOrderStatus ); 

app.post('/api/laundry/orders',express.json(),getLaundryOrders );
app.post('/api/laundry/order',express.json(),getLaundryOrders );
app.post('/api/laundry/order-details',express.json(),getLaundryOrderDetails );

app.post('/api/laundry/order-items',express.json(),getLaundryOrderItems );
app.post('/api/laundry/customer-details',express.json(),getLaundryCustomerDetails );
app.post('/api/laundry/order/delete-item',express.json(),deleteOrderItem );







 


 
const port = process.env.PORT || 3000;

const server = http.createServer(app);

// Create a single Socket.IO server
const io = new Server(server, { cors: { origin: "*" } });
initSocketServer(io);

// app.listen(port,()=>{
//     console.log('server has started');
// })

server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});


// const server =  app.listen(3000, "0.0.0.0", () => {
//   console.log("Server running on port 3000");
// });
 
// server.setTimeout(60000, () => {
//     console.log('Request timed out after 60 seconds');
// });


// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down gracefully...');
    server.close(() => {
        console.log('Closed all connections');
        process.exit(0);
    });
});


