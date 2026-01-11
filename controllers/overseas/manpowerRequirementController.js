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
 
  
 
const manpowerRequirementSaveUpdate = async (req, res) => {
  const formData = req.body;

  let pool;
  let transaction;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    await setTenantContext(pool, req);

    transaction = new sql.Transaction(pool);
    await transaction.begin();

   
    const masterRequest = new sql.Request(transaction);

    const masterResult = await masterRequest
      .input("ID2", sql.NVarChar(65), formData.ID2 || null)
      .input("ClientId", sql.NVarChar(65), formData.clientId)
      .input("AgencyId", sql.NVarChar(65), formData.agencyId)
      .input("TargetDate", sql.NVarChar(100), formData.targetDate) 
      .input("Comments", sql.NVarChar(sql.MAX), formData.comments)
      .input("Status", sql.NVarChar(50), formData.statusId || "1")
      .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
      .input("OrganizationId", sql.NVarChar(65), formData.organizationId)
      .input("CreatedBy", sql.NVarChar(100), req.authUser.username)
      .input("ChangedBy", sql.NVarChar(100), req.authUser.username)
      .execute("ManpowerRequirementMaster_SaveOrUpdate");

    const requirementID = masterResult.recordset[0]?.ID2;



    if (formData.requirements) {
        const requirements = JSON.parse(formData.requirements); 
        await manpowerRequirementDetailSaveUpdate(
            req,
            requirementID,
            requirements,
            transaction
        );
    }

    await transaction.commit();

    res.status(200).json({
      message: "Manpower Requirement Saved Successfully",
      requirementID,
    });

  } catch (error) {
    console.error("SAVE ERROR:", error);
    if (transaction) await transaction.rollback();

    res.status(400).json({
      message: error.message,
    });
  }
};


async function manpowerRequirementDetailSaveUpdate(req, requirementID, details, transaction) {
  try {
    const formData = req.body;

    for (const item of details) {
      const request = new sql.Request(transaction);

      await request
        .input("ID2", sql.NVarChar(65), item.ID2 || null)
        .input("RequirementID", sql.NVarChar(65), requirementID)
        .input("Trade", sql.NVarChar(150), item.trade)
        .input("Quantity", sql.Int, item.quantity)
        .input("MinSalary", sql.Decimal(18, 2), item.minSalary || 0)
        .input("MaxSalary", sql.Decimal(18, 2), item.maxSalary || 0)
        .input("Nationality", sql.NVarChar(50), item.nationality)
        .input("Food", sql.Bit,  parseBoolean(item.food) )
        .input("Accommodation", sql.Bit, parseBoolean(item.accommodation))
        .input("Transportation", sql.Bit, parseBoolean(item.transportation))
        .input("Status", sql.NVarChar(50), item.statusId || "1")
        .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
        .input("OrganizationID", sql.NVarChar(65), formData.organizationId)
        .input("CreatedBy", sql.NVarChar(100), req.authUser.username)
        .input("ChangedBy", sql.NVarChar(100), req.authUser.username)
        .execute("ManpowerRequirementDetails_SaveOrUpdate");
    }
  } catch (error) {
    throw new Error("Detail Save Failed: " + error.message);
  }
}


// end of manpowerRequirementDetailSaveUpdate

 
function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return lower === "yes" || lower === "true" || lower === "1";
  }
  return Boolean(value);
}

 
const getManpowerRequirementsDetails = async (req, res) => {  
    const { Id } = req.body; // user data sent from client
      
    try {
        // Set database and user context
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  

        await setTenantContext(pool, req);
 
        // Execute stored procedure
        const response = await pool.request()
            .input('ID2', sql.NVarChar(65), Id || null) 
            .execute('ManpowerRequirement_GetByID');

        // Extract recordsets
        const masterRecord = response.recordsets[0][0] || null; // master
        const requirements = response.recordsets[1] || [];             // items
        const agents = response.recordsets[2];

        const merged = requirements.map(req => ({
            ...req,
            agents: agents.filter(a => a.requirementDetailId === req.ID2)
        }));

      
        res.status(200).json({
            message: `Manpower Requirement details loaded successfully!`,
            data: {
                manpowerRequirementDetails: masterRecord,
                requirements: merged
            }
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};


const getManpowerRequirementsList = async (req, res) => {  
    const { Id, organizationId, } = req.body; // user data sent from client
      
    try {
        // Set database and user context
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  

        await setTenantContext(pool, req);
 
        // Execute stored procedure
        const response = await pool.request()
        .input('tenantId', sql.NVarChar(65), req.authUser.tenantId)  
            .input('organizationId', sql.NVarChar(65), organizationId || null) 
            .execute('ManpowerRequirement_GetAllWithSummary');

         
        res.status(200).json({
            message: `Manpower Requirement details loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
const manpowerRequirementDetailsDelete = async (req, res) => {  
    const { Id, organizationId } = req.body; // user data sent from client
      
    try {
        // Set database and user context
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  

        await setTenantContext(pool, req);
 
        // Execute stored procedure
        const response = await pool.request() 
            .input('ID2', sql.NVarChar(65), Id || null) 
            .execute('ManpowerRequirementDetails_Delete');

         
        res.status(200).json({
            message: `Manpower Requirement details deleted successfully!`,
            data: null
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};

const agentAssignmentSaveUpdate = async (req, res) => {
  const formData = req.body;
  let pool;
  let transaction;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    await setTenantContext(pool, req);

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const assignments = JSON.parse(formData.assignments);
    console.log("Parsed Assignments:", assignments);
    for (const detail of assignments) {
        console.log("Processing Detail:", detail);

      if (!detail.ID2) continue;

      for (const agent of detail.agents) {
        console.log("agent:", agent);

        const request = new sql.Request(transaction);

        await request
          .input("ID2", sql.NVarChar(65), agent.ID2 || "0")
          .input("RequirementDetailID", sql.NVarChar(65), detail.ID2)
          .input("AgentID", sql.NVarChar(65), agent.agentId)
          .input("AssignedQty", sql.Int, Number(agent.assignedQty) || 0)
          .input("DeliveredQty", sql.Int, Number(agent.deliveredQty) || 0)
          .input("TargetDate", sql.Date, detail.targetDate || null)   
          .input("StatusId", sql.NVarChar(50), formData.status?.toString() || "1")
          .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
          .input("OrganizationID", sql.NVarChar(65), formData.organizationId)
          .input("UserName", sql.NVarChar(100), req.authUser.username)
          .execute("ManpowerRequirementAgentAssignments_SaveOrUpdate");
      }
    }

    await transaction.commit();

    res.status(200).json({
      message: "Agent Assignments saved successfully",
      status: true
    });

  } catch (err) {
    console.error("Agent Assignment Save ERROR:", err);

    if (transaction) await transaction.rollback();

    res.status(400).json({
      message: err.message,
      status: false
    });
  }
};

const getAgentsList = async (req, res) => {  
    const { Id, organizationId, } = req.body; // user data sent from client
      
    try {
        // Set database and user context
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  

        await setTenantContext(pool, req);
 
        // Execute stored procedure
        const response = await pool.request() 
            .input('organizationId', sql.NVarChar(65), organizationId || null) 
            .execute('GetAgentsList');

         
        res.status(200).json({
            message: `Agents list loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
const assignedAgentDelete = async (req, res) => {  
    const { Id,requirementID,agentID, organizationId } = req.body; // user data sent from client
      
    try {
        // Set database and user context
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  

        await setTenantContext(pool, req);
 
        // Execute stored procedure
        const response = await pool.request() 
            .input('ID2', sql.NVarChar(65), Id || null) 
            .input('RequirementID', sql.NVarChar(65), requirementID || null) 
            .input('AgentID', sql.NVarChar(65), agentID || null) 

            .execute('ManpowerRequirementAgentAssignments_Delete');

         
        res.status(200).json({
            message: `Assigned agent deleted successfully!`,
            data: null
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};

const candidateSaveUpdate = async (req, res) => {
  const formData = req.body;
  let pool;
  let transaction;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    await setTenantContext(pool, req);

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const request = new sql.Request(transaction);

    const result = await request
      .input("ID2", sql.NVarChar(65), formData.ID2 || null)

      .input("RequirementID", sql.NVarChar(65), formData.requirementID) 
      .input("AgentID", sql.NVarChar(65), req.authUser.agentId)

      .input("FullName", sql.NVarChar(150), formData.fullName)
      .input("Nationality", sql.NVarChar(100), formData.nationality)
      .input("Age", sql.Int, formData.age || null)
      .input("Phone", sql.NVarChar(30), formData.phone || null)
      .input("PassportNo", sql.NVarChar(50), formData.passportNo)

      .input("Trade", sql.NVarChar(100), formData.trade)
      .input("Salary", sql.Decimal(18, 2), formData.salary || null)

      .input("Food", sql.Bit, parseBoolean(formData.food))
      .input("Accommodation", sql.Bit, parseBoolean(formData.accommodation))
      .input("Transportation", sql.Bit, parseBoolean(formData.transportation))

      .input("Status", sql.NVarChar(50), formData.status || "Selected")
      .input("StatusID", sql.Int, formData.statusId || null)

      .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
      .input("OrganizationID", sql.NVarChar(65), formData.organizationId)
      .input("UserName", sql.NVarChar(100), req.authUser.username)

      .execute("CandidateMaster_SaveOrUpdate");

    await transaction.commit();

    res.status(200).json({
      message: "Candidate saved successfully",
      data: result.recordset[0],
      status: true
    });

  } catch (error) {
    console.error("Candidate Save Error:", error);

    if (transaction) await transaction.rollback();

    res.status(400).json({
      message: error.message,
      status: false
    });
  }
};


const getCandidatesList = async (req, res) => {  
    const { Id,manpowerRequirementID,agentId, organizationId } = req.body;  
      
    try {
        // Set database and user context
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  

        await setTenantContext(pool, req);
 
        // Execute stored procedure
        const response = await pool.request() 
            .input('RequirementID', sql.NVarChar(65), manpowerRequirementID || null) 
            .input('AgentID', sql.NVarChar(65), req.authUser.agentId || null)  
            .execute('CandidateMaster_GetByRequirementID');

         
        res.status(200).json({
            message: `Candidates list loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};

const getManpowerRequirementsByAgent = async (req, res) => {  
    const { Id, organizationId,requirementID } = req.body; // user data sent from client
      
    try {
        // Set database and user context
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  

        await setTenantContext(pool, req);
 
        // Execute stored procedure
        const response = await pool.request()
            .input('AgentID', sql.NVarChar(65), req.authUser.agentId)  
            .input('RequirementID', sql.NVarChar(65), requirementID || null)  
            .input('TenantID', sql.NVarChar(65), req.authUser.tenantId)  
            .input('OrganizationID', sql.NVarChar(65), organizationId || null) 
            .execute('ManpowerRequirementAgentAssignments_GetByAgent');

         
        res.status(200).json({
            message: `Manpower Requirement Agent Assignments loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
 
const getAssignedAgentTrades = async (req, res) => {  
    const { Id, organizationId,requirementID } = req.body; // user data sent from client
      
    try {
        // Set database and user context
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  

        await setTenantContext(pool, req);
 
        // Execute stored procedure
        const response = await pool.request()
            .input('AgentID', sql.NVarChar(65), req.authUser.agentId)  
            .input('RequirementID', sql.NVarChar(65), requirementID || null)  
            .input('TenantID', sql.NVarChar(65), req.authUser.tenantId)  
            .input('OrganizationID', sql.NVarChar(65), organizationId || null) 
            .execute('ManpowerRequirementAgentAssignedTrades_GetByAgent');

         
        res.status(200).json({
            message: `Manpower Requirement AgentAssigned Trades  loaded successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};

 
const updateCandidateStatus = async (req, res) => {  
    const { Id, organizationId,requirementID } = req.body; // user data sent from client
      
    try {
        // Set database and user context
        store.dispatch(setCurrentDatabase(req.authUser.database));
        store.dispatch(setCurrentUser(req.authUser)); 
        const config = store.getState().constents.config;    
        const pool = await sql.connect(config);  

        await setTenantContext(pool, req);
 
        // Execute stored procedure
        const response = await pool.request()
            .input('CandidateID2', sql.NVarChar(65), Id)  
            .input('StatusID', sql.NVarChar(65), requirementID || null)  
            .input('TenantID', sql.NVarChar(65), req.authUser.tenantId)  
            .input('OrganizationID', sql.NVarChar(65), organizationId || null) 
            .input('UserName', sql.NVarChar(65), req.authUser.username || null) 

            .execute('CandidateMaster_UpdateStatus');

         
        res.status(200).json({
            message: `Manpower Requirement Candidate Status updated successfully!`,
            data: response.recordset
        });
         
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};

 

module.exports =  {getAssignedAgentTrades,getManpowerRequirementsByAgent,getCandidatesList,candidateSaveUpdate, manpowerRequirementDetailsDelete,assignedAgentDelete,getAgentsList, agentAssignmentSaveUpdate, getManpowerRequirementsList,getManpowerRequirementsDetails, manpowerRequirementSaveUpdate} ;
