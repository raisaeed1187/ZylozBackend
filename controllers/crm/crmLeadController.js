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

const crmLeadSaveUpdate = async (req, res) => {
    const formData = req.body;

    try { 

        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser));
        const config = store.getState().constents.config;

        console.log('formData:', formData);

        const pool = await sql.connect(config);

        const result = await pool.request()
            .input('ID2', sql.NVarChar(65), formData.ID2 || null)
            .input('LeadName', sql.NVarChar(255), formData.leadName || null)
            .input('LeadCode', sql.NVarChar(50), formData.leadCode || null)
            .input('JobTitle', sql.NVarChar(255), formData.jobTitle || null)
            .input('CompanyName', sql.NVarChar(255), formData.companyName || null)
            .input('Email', sql.NVarChar(255), formData.email || null)
            .input('Phone', sql.NVarChar(50), formData.phone || null)
            .input('LeadSource', sql.NVarChar(100), formData.leadSource || null)
            .input('LeadStatus', sql.NVarChar(100),String(formData.leadStatus) || null)
            .input('AssignedOwner', sql.NVarChar(100), formData.assignedOwner || null)
            .input('Priority', sql.NVarChar(50), formData.priority || null)
            .input('Country', sql.NVarChar(100), formData.country || null)
            .input('State', sql.NVarChar(100), formData.state || null)
            .input('City', sql.NVarChar(100), formData.city || null)
            .input('Industry', sql.NVarChar(100), formData.industry || null)
            .input('CompanySize', sql.NVarChar(65), formData.companySize || null)
            .input('EstBudget', sql.Decimal(18,2), formData.estBudget || null)
            .input('NextAction', sql.NVarChar(100), formData.nextAction || null)
            .input('FollowUpDate', sql.DateTime, formData.followUpDate || null)
            .input('SetReminder', sql.Bit, parseBoolean(formData.setReminder || 0) ||  0)
            .input('PreferredMethod', sql.NVarChar(65), formData.preferredMethod || null)
            .input('BestTime', sql.NVarChar(65), formData.bestTime || null)
            .input('EmailNewsletter', sql.Bit, parseBoolean(formData.emailNewsletter || 0) || 0)
            .input('MarketingUpdates', sql.Bit, parseBoolean(formData.marketingUpdates || 0) || 0)
            .input('Notes', sql.NVarChar(sql.MAX), formData.notes || null)
            .input('OrganizationId', sql.NVarChar(65), formData.organizationId || null)
            .input('CreatedBy', sql.NVarChar(100), req.authUser.username || null)
            .input('ChangedBy', sql.NVarChar(100), req.authUser.username || null)
            .execute('CRMLead_SaveOrUpdate');

        res.status(200).json({
            message: 'CRM Lead saved/updated successfully',
            data: result.recordset[0] // This will return the ID2
        });

    } catch (error) {
        console.error(error);
        res.status(400).json({ message: error.message, data: null });
    }
};

// end of crmLeadSaveUpdate

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }
  return Boolean(value); // handles 0, 1, null, undefined
}
 
  
const getCRMLeadDetails = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
           const result = await pool.request()
            .input('ID2', sql.NVarChar(65), Id ||  null) 
            .input('OrganizationId', sql.NVarChar(65), null)
            .execute('CRMLead_Get');
 
            // const resultActivities = await pool.request()
            // .input('LeadID', sql.NVarChar(65), Id ||  null)  
            // .execute('CRMLeadActivities_Get');
 

        const data = {
            crmLeadDetails: result.recordset[0],
            // crmLeadActivities: resultActivities.recordset
        }
         
        res.status(200).json({
            message: `CRMLead details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCRMLeadDetails
 
const getCRMLeadActivities = async (req, res) => {  
    const {Id,isOpportunity} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let result = null;

          if (isOpportunity) {
            result = await pool.request()
            .input('OpportunityID', sql.NVarChar(65), Id ||  null)  
            .execute('CRMLeadOpportunityActivities_Get'); 
          }else{
            result = await pool.request()
            .input('LeadID', sql.NVarChar(65), Id ||  null)  
            .execute('CRMLeadActivities_Get');
          }

           

            
 
       
         
        res.status(200).json({
            message: `CRMLead details loaded successfully!`,
            data: result.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCRMLeadActivities
 

const getCRMLeadsList = async (req, res) => {  
    const {organizationId,Id} = req.body; // user data sent from client
     
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
         
        const result = await pool.request()
            .input('ID2', sql.NVarChar(65),  null) 
            .input('OrganizationId', sql.NVarChar(65), organizationId || null)
            .execute('CRMLead_Get');
        
        res.status(200).json({
            message: `CRMLeads List loaded successfully!`,
            data:  result.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCRMLeadsList
  

const saveOrUpdateLeadStatusHistory = async (req, res) => {
  const formData = req.body;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    const pool = await sql.connect(config);
    const transaction = new sql.Transaction(pool);

    let transactionBegun = false;

    try {
      await transaction.begin();
      transactionBegun = true;

      const request = new sql.Request(transaction);

      request.input("ID2", sql.NVarChar(65), formData.ID2 ?? null);
      request.input("LeadID", sql.NVarChar(65), formData.leadID);
      request.input("FromStatus", sql.Int, formData.fromStatus ?? null);
      request.input("ToStatus", sql.Int, formData.toStatus ?? null);
      request.input("ActionType", sql.NVarChar(50), formData.actionType ?? null);
      request.input("ChangeBy", sql.NVarChar(100), req.authUser.username);
      request.input("DurationInPreviousStage", sql.Int, formData.durationInPreviousStage ?? null);

      const result = await request.execute("LeadStatusHistory_SaveOrUpdate");

      await transaction.commit();

      return res.status(200).json({
        message: "Lead status history saved/updated successfully",
        data: result.recordset?.[0] || null,
      });

    } catch (err) {

      // 🛑 Rollback ONLY if transaction actually started
      if (transactionBegun) {
        await transaction.rollback();
      }

      console.error("Transaction rolled back due to error:", err);

      return res.status(400).json({
        message: err.message,
        data: null,
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: error.message,
      data: null,
    });
  }
};

 
const leadCallLogSaveOrUpdate = async (req, res) => {
  const formData = req.body;

  try {
    // Set database and current user
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    const pool = await sql.connect(config);
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const request = new sql.Request(transaction);

      request.input("ID2", sql.NVarChar(65), formData.ID2 || null);
      request.input("LeadID", sql.NVarChar(65), formData.leadID|| null);
      request.input("CallType", sql.NVarChar(50), formData.callType || null);
      request.input("CallOutcome", sql.NVarChar(50), formData.callOutcome || null);
      request.input("CallDate", sql.NVarChar(50), formData.callDate);
      request.input("StartTime", sql.NVarChar(50), formData.startTime || null);
      request.input("DurationInMinutes", sql.Int, formData.duration || null);
      request.input("Subject", sql.NVarChar(255), formData.subject || null);
      request.input("Notes", sql.NVarChar(sql.MAX), formData.notes || null);
      request.input("Tags", sql.NVarChar(sql.MAX), formData.tags && formData.tags.trim() !== "" ? formData.tags : null);
      request.input("NextAction", sql.NVarChar(100), formData.nextAction || null);
      request.input("FollowUpDate", sql.NVarChar(50), formData.followUpDate || null);
      request.input("Priority", sql.NVarChar(20), formData.priority || null);
      request.input("FollowUpNotes", sql.NVarChar(sql.MAX), formData.followUpNotes || null);
      request.input("NewStatus", sql.NVarChar(50), formData.newStatus || null);
      request.input("ConvertLead", sql.Bit, parseBoolean(formData.convertLead) ? 1 : 0);
      request.input("CreatedBy", sql.NVarChar(100), req.authUser.username);
      request.input("UpdatedBy", sql.NVarChar(100), req.authUser.username || null);
      request.input("OpportunityID", sql.NVarChar(65), formData.opportunityID || null);

      const result = await request.execute("LeadCallLog_SaveOrUpdate");

      await transaction.commit();

      res.status(200).json({
        message: "Lead call log saved/updated successfully",
        data: result.recordset[0] || null,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction rolled back due to error:", err);
      res.status(400).json({ message: err.message, data: null });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message, data: null });
  }
};

  
const leadNoteSaveOrUpdate = async (req, res) => {
  const formData = req.body; // Expecting { ID2, LeadID, Title, Content, Category, Priority, Tags }
  const currentUser = req.authUser?.username || "Unknown";

  try {
    // Assuming you have a Redux-like store or config object for DB
    store.dispatch(setCurrentDatabase(req.authUser.database));
    const config = store.getState().constents.config;

    const pool = await sql.connect(config);
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const request = new sql.Request(transaction);

      request.input("ID2", sql.NVarChar(65), formData.ID2 || null);
      request.input("LeadID", sql.NVarChar(65), formData.leadId || null);
      request.input("Title", sql.NVarChar(255), formData.title);
      request.input("Content", sql.NVarChar(sql.MAX), formData.content || null);
      request.input("Category", sql.NVarChar(100), formData.category || null);
      request.input("Priority", sql.NVarChar(20), formData.priority || "Medium");
      request.input("Tags", sql.NVarChar(sql.MAX), formData.tags || null);
      request.input("UserName", sql.NVarChar(100), currentUser);
      request.input("OpportunityID", sql.NVarChar(65), formData.opportunityID || null);

      const result = await request.execute("CRMLeadNotes_SaveOrUpdate");

      await transaction.commit();

      res.status(200).json({
        message: "Lead note saved/updated successfully",
        data: result.recordset[0] || null,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction rolled back due to error:", err);
      res.status(400).json({ message: err.message, data: null });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message, data: null });
  }
};
// end of save


const leadMeetingSaveOrUpdate = async (req, res) => {
  const formData = req.body;

  let pool, transaction;

  try {
    // Set database and logged-in user
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const request = new sql.Request(transaction);

      request.input("ID2", sql.NVarChar(65), formData.ID2 || null);
      request.input("LeadID", sql.NVarChar(65), formData.leadId || null);

      request.input("MeetingType", sql.NVarChar(100), formData.meetingType);
      request.input("Duration", sql.NVarChar(50), formData.duration);
      request.input("Title", sql.NVarChar(255), formData.title);

      request.input("MeetingDate", sql.NVarChar(50), formData.date);
      request.input("MeetingTime", sql.NVarChar(50), formData.time || null);

      request.input("Platform", sql.NVarChar(100), formData.platform);
      request.input("Agenda", sql.NVarChar(sql.MAX), formData.agenda);
      request.input("Notes", sql.NVarChar(sql.MAX), formData.notes);

      // Attendees as JSON string
      request.input(
        "Attendees",
        sql.NVarChar(sql.MAX),
        formData.attendees
      );

      request.input("UserName", sql.NVarChar(100), req.authUser.username);
      request.input("OpportunityID", sql.NVarChar(65), formData.opportunityID || null);

      const result = await request.execute("CRMLeadMeetings_SaveOrUpdate");

      await transaction.commit();

      res.status(200).json({
        message: "Meeting saved/updated successfully",
        data: result.recordset[0] || null,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction rolled back:", err);
      res.status(400).json({ message: err.message, data: null });
    }
  } catch (error) {
    console.error("DB error:", error);
    res.status(500).json({ message: error.message, data: null });
  }
};


const opportunitysaveUpdate = async (req, res) => {
  const formData = req.body;

  let pool, transaction;

  try {
    // Set DB and user
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));

    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const request = new sql.Request(transaction);

      request.input("ID2", sql.NVarChar(65), formData.ID2 || null);
      request.input("LeadID", sql.NVarChar(65), formData.leadID);

      request.input("OpportunityName", sql.NVarChar(255), formData.opportunityName);
      request.input("Account", sql.NVarChar(65), formData.account);
      request.input("DealValue", sql.Decimal(18, 2), formData.dealValue);
      request.input("Stage", sql.NVarChar(100), formData.stage);
      request.input("Probability", sql.Int, formData.probability);
      request.input("ExpectedCloseDate", sql.NVarChar(100), formData.expectedCloseDate);
      request.input("Owner", sql.NVarChar(100), formData.owner);

      request.input("Description", sql.NVarChar(sql.MAX), formData.description);
      request.input("LeadSource", sql.NVarChar(100), formData.leadSource);
      request.input("Campaign", sql.NVarChar(100), formData.campaign);
      request.input("PrimaryContact", sql.NVarChar(255), formData.primaryContact);
      request.input("DecisionMaker", sql.NVarChar(255), formData.decisionMaker);

      request.input("OrganizationId", sql.NVarChar(65), formData.organizationId);
      request.input("StatusId", sql.Int, formData.statusId);

      request.input("UserName", sql.NVarChar(100), req.authUser.username);

      const result = await request.execute("CRMOpportunity_SaveOrUpdate");

      await transaction.commit();

      res.status(200).json({
        message: "Opportunity saved/updated successfully",
        data: result.recordset[0] || null,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction rolled back:", err);
      res.status(400).json({ message: err.message, data: null });
    }
  } catch (error) {
    console.error("DB error:", error);
    res.status(500).json({ message: error.message, data: null });
  }
};

const getCRMOpportunity = async (req, res) => {
  const { id2, organizationId } = req.body;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    const pool = await sql.connect(config);
    const request = pool.request();

    request.input("ID2", sql.NVarChar(65), id2 || null);
    request.input("OrganizationId", sql.NVarChar(65), organizationId || null);

    const result = await request.execute("CRMOpportunity_Get");

    res.status(200).json({
      message: "Opportunity data retrieved",
      data: result.recordset,
    });
  } catch (err) {
    console.error("Error fetching opportunity:", err);
    res.status(500).json({ message: err.message, data: null });
  }
};
const getCRMOpportunityDetails = async (req, res) => {  
    const {Id} = req.body;  
      
    try {
         
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  
        let query = '';
 
           const result = await pool.request()
            .input('ID2', sql.NVarChar(65), Id ||  null) 
            .input('OrganizationId', sql.NVarChar(65), null)
            .execute('CRMOpportunity_Get');
 
            // const resultActivities = await pool.request()
            // .input('LeadID', sql.NVarChar(65), Id ||  null)  
            // .execute('CRMLeadActivities_Get');
 

        const data = {
            crmOpportunityDetails: result.recordset[0],
            // crmLeadActivities: resultActivities.recordset
        }
         
        res.status(200).json({
            message: `CRM Opportunity details loaded successfully!`,
            data: data
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message,data:null});
        
    }
};
// end of getCRMLeadDetails
 

const crmAccountSaveUpdate = async (req, res) => {
  const formData = req.body;

  let pool, transaction;

  try {
    // Set DB and user
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));

    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const request = new sql.Request(transaction);

      request.input("ID2", sql.NVarChar(65), formData.ID2 || null);

      request.input("CompanyName", sql.NVarChar(255), formData.companyName);
      request.input("AccountType", sql.NVarChar(100), formData.accountType);
      request.input("Industry", sql.NVarChar(150), formData.industry);
      request.input("CompanySize", sql.NVarChar(100), formData.companySize);
      request.input("AnnualRevenue", sql.Decimal(18, 2), formData.annualRevenue);
      request.input("Website", sql.NVarChar(255), formData.website);
      request.input("Description", sql.NVarChar(sql.MAX), formData.description);

      request.input("MainPhone", sql.NVarChar(50), formData.mainPhone);
      request.input("Email", sql.NVarChar(255), formData.email);

      request.input("StreetAddress", sql.NVarChar(300), formData.streetAddress);
      request.input("City", sql.NVarChar(150), formData.city);
      request.input("State", sql.NVarChar(150), formData.state);
      request.input("ZipCode", sql.NVarChar(50), formData.zipCode);
      request.input("Country", sql.NVarChar(150), formData.country);

      request.input("AccountOwner", sql.NVarChar(150), formData.accountOwner);
      request.input("PriorityLevel", sql.NVarChar(50), formData.priorityLevel);

      request.input("LeadSource", sql.NVarChar(100), formData.leadSource);
      request.input("Territory", sql.NVarChar(100), formData.territory);

      request.input("Tags", sql.NVarChar(sql.MAX), formData.tags ? JSON.stringify(formData.tags) : null);

      request.input("StatusId", sql.Int, formData.statusId || 1);
      request.input("OrganizationId", sql.NVarChar(65), formData.organizationId);

      request.input("User", sql.NVarChar(150), req.authUser.username);

      const result = await request.execute("CRMAccount_SaveOrUpdate");

      await transaction.commit();

      res.status(200).json({
        message: "Account saved/updated successfully",
        data: result.recordset?.[0] || null,
      });

    } catch (err) {
      await transaction.rollback();
      console.error("Transaction rolled back:", err);

      res.status(400).json({
        message: err.message,
        data: null,
      });
    }

  } catch (error) {
    console.error("DB Error:", error);

    res.status(500).json({
      message: error.message,
      data: null,
    });
  }
};

const getCRMAccount = async (req, res) => {
  const { id2, organizationId } = req.body;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    const pool = await sql.connect(config);
    const request = pool.request();

    request.input("ID2", sql.NVarChar(65), id2 || null);
    request.input("OrganizationId", sql.NVarChar(65), organizationId || null);

    const result = await request.execute("CRMAccount_Get");

    res.status(200).json({
      message: "Account data retrieved",
      data: result.recordset,
    });
  } catch (err) {
    console.error("Error fetching account:", err);
    res.status(500).json({ message: err.message, data: null });
  }
};


const crmContactSaveUpdate = async (req, res) => {
  const formData = req.body;

  let pool, transaction;

  try {
    // Set DB and user from Redux store or request
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));

    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const request = new sql.Request(transaction);

      // Input parameters
      request.input("ID2", sql.NVarChar(65), formData.ID2 || null);
      request.input("FirstName", sql.NVarChar(150), formData.firstName);
      request.input("LastName", sql.NVarChar(150), formData.lastName);
      request.input("Salutation", sql.NVarChar(50), formData.salutation);
      request.input("Email", sql.NVarChar(255), formData.email);
      request.input("Phone", sql.NVarChar(50), formData.phone);
      request.input("Mobile", sql.NVarChar(50), formData.mobile);
      request.input("DOB", sql.NVarChar(100), formData.dob || null);
      request.input("LinkedIn", sql.NVarChar(255), formData.linkedin);
      request.input("Language", sql.NVarChar(50), formData.language || "en");
      request.input("JobTitle", sql.NVarChar(150), formData.jobTitle);
      request.input("Department", sql.NVarChar(150), formData.department);
      request.input("Account", sql.NVarChar(65), formData.account);
      request.input("AccountName", sql.NVarChar(255), formData.accountName);
      request.input("ReportsTo", sql.NVarChar(150), formData.reportsTo);
      request.input("Assistant", sql.NVarChar(150), formData.assistant);
      request.input("WorkEmail", sql.NVarChar(255), formData.workEmail);
      request.input("WorkPhone", sql.NVarChar(50), formData.workPhone);
      request.input("LeadSource", sql.NVarChar(100), formData.leadSource);
      request.input("LeadStatus", sql.NVarChar(50), formData.leadStatus || "new");
      request.input("ContactOwner", sql.NVarChar(150), formData.contactOwner);
      request.input("Priority", sql.NVarChar(50), formData.priority || "low");
      request.input("Communication", sql.NVarChar(50), formData.communication || "email");
      request.input("Tags", sql.NVarChar(sql.MAX), JSON.stringify(formData.tags || []));
      request.input("TagInput", sql.NVarChar(sql.MAX), formData.tagInput);
      request.input("Notes", sql.NVarChar(sql.MAX), formData.notes);
      request.input("AccountType", sql.NVarChar(100), formData.accountType);
      request.input("OrganizationId", sql.NVarChar(65), formData.organizationId);
      request.input("StatusId", sql.Int, formData.statusId || 0);

      request.input("User", sql.NVarChar(150), req.authUser.username);

      const result = await request.execute("CRMContact_SaveOrUpdate");

      await transaction.commit();

      res.status(200).json({
        message: "Contact saved/updated successfully",
        data: result.recordset[0] || null,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction rolled back:", err);
      res.status(400).json({ message: err.message, data: null });
    }
  } catch (error) {
    console.error("DB error:", error);
    res.status(500).json({ message: error.message, data: null });
  }
};

const getCRMContact = async (req, res) => {
  const { id2, organizationId } = req.body;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    const pool = await sql.connect(config);
    const request = pool.request();

    request.input("ID2", sql.NVarChar(65), id2 || null);
    request.input("OrganizationId", sql.NVarChar(65), organizationId || null);

    const result = await request.execute("CRMContact_Get");

    res.status(200).json({
      message: "Contact data retrieved",
      data: result.recordset,
    });
  } catch (err) {
    console.error("Error fetching Contact:", err);
    res.status(500).json({ message: err.message, data: null });
  }
}; 
 
const saveOrUpdateOpportunityStatusHistory = async (req, res) => {
  const formData = req.body;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    const pool = await sql.connect(config);
    const transaction = new sql.Transaction(pool);

    let transactionBegun = false;

    try {
      await transaction.begin();
      transactionBegun = true;

      const request = new sql.Request(transaction);

      request.input("ID2", sql.NVarChar(65), formData.ID2 ?? null);
      request.input("OpportunityID", sql.NVarChar(65), formData.opportunityID);
      request.input("FromStatus", sql.Int, formData.fromStatus ?? null);
      request.input("ToStatus", sql.Int, formData.toStatus ?? null);
      request.input("ActionType", sql.NVarChar(50), formData.actionType ?? null);
      request.input("ChangeBy", sql.NVarChar(100), req.authUser.username);
      request.input("DurationInPreviousStage", sql.Int, formData.durationInPreviousStage ?? null);

      const result = await request.execute("OpportunityStatusHistory_SaveOrUpdate");

      await transaction.commit();

      return res.status(200).json({
        message: "Opportunity status history saved/updated successfully",
        data: result.recordset?.[0] || null,
      });

    } catch (err) {

      // 🛑 Rollback ONLY if transaction actually started
      if (transactionBegun) {
        await transaction.rollback();
      }

      console.error("Transaction rolled back due to error:", err);

      return res.status(400).json({
        message: err.message,
        data: null,
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: error.message,
      data: null,
    });
  }
};

  
const CRMEmailSaveOrUpdate = async (req, res) => {
  const formData = req.body;

  let pool, transaction;

  try {
    // Example: get DB config dynamically (adjust as per your app)
    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const request = new sql.Request(transaction);

      request.input("ID2", sql.NVarChar(65), formData.ID2 || null);
      request.input("LeadId", sql.NVarChar(65), formData.leadId || null);
      request.input("OpportunityID", sql.NVarChar(65), formData.opportunityID || null);
      request.input("ToRecipients", sql.NVarChar(sql.MAX), JSON.stringify(formData.to || []));
      request.input("CCRecipients", sql.NVarChar(sql.MAX), JSON.stringify(formData.cc || []));
      request.input("BCCRecipients", sql.NVarChar(sql.MAX), JSON.stringify(formData.bcc || []));
      request.input("FromEmail", sql.NVarChar(255), formData.fromEmail || null);
      request.input("Subject", sql.NVarChar(500), formData.subject || null);
      request.input("Body", sql.NVarChar(sql.MAX), formData.body || null);
      request.input("Attachments", sql.NVarChar(sql.MAX), JSON.stringify(formData.attachments || []));
      request.input("OrganizationId", sql.NVarChar(65), formData.organizationId || null);
      request.input("StatusId", sql.Int, formData.statusId || 1);
      request.input("User", sql.NVarChar(150), req.authUser.username);

      const result = await request.execute("CRMEmail_SaveOrUpdate");

      await transaction.commit();

      res.status(200).json({
        message: "Email saved/updated successfully",
        data: result.recordset[0] || null,
      });
    } catch (err) {
      await transaction.rollback();
      console.error("Transaction rolled back:", err);
      res.status(400).json({ message: err.message, data: null });
    }
  } catch (error) {
    console.error("DB error:", error);
    res.status(500).json({ message: error.message, data: null });
  }
};

 



module.exports =  {CRMEmailSaveOrUpdate,saveOrUpdateOpportunityStatusHistory,crmContactSaveUpdate,getCRMContact,getCRMAccount,crmAccountSaveUpdate,getCRMOpportunity,getCRMOpportunityDetails,opportunitysaveUpdate,leadMeetingSaveOrUpdate,leadNoteSaveOrUpdate,leadCallLogSaveOrUpdate,saveOrUpdateLeadStatusHistory,crmLeadSaveUpdate,getCRMLeadsList,getCRMLeadDetails,getCRMLeadActivities} ;
