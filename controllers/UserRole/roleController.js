const sql = require("mssql");
const express = require("express");
require("dotenv").config();
const store = require("../../store");
const { setCurrentDatabase, setCurrentUser } = require("../../constents").actions;

// const { io } = require("../../socket/socketServer");
const { getIO } = require("../../socket/socket"); 
const { setTenantContext } = require("../../helper/db/sqlTenant");


const roleSaveOrUpdate = async (req, res) => {
  const formData = req.body;

  let pool, transaction;

  try {
    // Set DB connection & user context
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    transaction = new sql.Transaction(pool);

    await setTenantContext(pool,req);

    
    await transaction.begin();
    
    const request = new sql.Request(transaction);
      
    const mainPermissions = JSON.parse(formData.mainPermissions); 
    const extraPermissions = JSON.parse(formData.extraPermissions); 
    
    // Save/Update Role
    const roleResult = await request
      .input("ID2", sql.NVarChar(65), formData.ID2 || null)
      .input("RoleName", sql.NVarChar(100), formData.roleName)
      .input("Description", sql.NVarChar(500), formData.description || null)
      .input("CreatedBy", sql.NVarChar(100), req.authUser?.username) 
      .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
      
      .output("ID", sql.NVarChar(65))
      .execute("ApplicationRole_SaveOrUpdate");

    const newRoleID = roleResult.output.ID;

    // Save/Update Role Permissions
    if (formData.mainPermissions?.length) { 
       await applicationRolePermissionsSaveUpdate(req,newRoleID,transaction); 
    }
    
    // console.log('before emmit');
    


    const io = getIO();

    if (io) {
        // console.log('inside before emmit'); 
      io.emit("permissionsUpdated", {
        roleId: newRoleID,
        message: `Permissions updated for role ${formData.roleName}`,
      }); 
    }

    await transaction.commit();


    res.status(200).json({
      message: "Role and permissions saved/updated successfully",
      roleID: '',
    });
  } catch (err) { 
      console.error("SQL ERROR DETAILS:", err);
      if (transaction) try { await transaction.rollback(); } catch(e) {}
      
      return res.status(400).json({ 
          message: err.message,
          // sql: err.originalError?.info || err
      }); 
  }
};

async function applicationRolePermissionsSaveUpdate(req,roleId,transaction){
    const formData = req.body; 
    const mainPermissions = JSON.parse(formData.mainPermissions); 
    try {
            
            try { 
                if (mainPermissions) {
                    for (let item of mainPermissions) {  
                        console.log(item);
                        if(item.transactionName){  
                            const itemRequest = new sql.Request(transaction);
                          
                            const rolePermissionResult = await itemRequest
                            .input("ID2", sql.NVarChar(65), item.ID2 || null)
                            .input("RoleID", sql.NVarChar(65), roleId)
                            .input("TransactionID", sql.NVarChar(65), item.transactionAccessId)
                            .input("TransactionName", sql.NVarChar(100), item.transactionName)
                            .input("FullAccess", sql.Bit, parseBoolean(item.fullAccess) ?? false)
                            .input("ViewAccess", sql.Bit, parseBoolean(item.view) ?? false)
                            .input("AddAccess", sql.Bit, parseBoolean(item.add) ?? false)
                            .input("EditAccess", sql.Bit, parseBoolean(item.edit) ?? false)
                            .input("DeleteAccess", sql.Bit, parseBoolean(item.delete) ?? false)
                            .input("ExportAccess", sql.Bit, parseBoolean(item.export) ?? false)
                            .input("PrintAccess", sql.Bit, parseBoolean(item.print) ?? false)
                            .input("CreatedBy", sql.NVarChar(100), req.authUser?.username) 
                            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
                            .output("ID", sql.NVarChar(65))
                            .execute("ApplicationRolePermissions_SaveOrUpdate");

                            const newRolePermissionID = rolePermissionResult.output.ID;

                            // Save Extra Permissions if any
                            if (item.extraPermissions?.length) {
                               await applicationRoleExtraPermissionsSaveUpdate(req,roleId,newRolePermissionID,item,transaction)
                            }

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
// end of applicationRolePermissionsSaveUpdate

async function applicationRoleExtraPermissionsSaveUpdate(req,roleId,rolePermissionID,itemData,transaction){
    const formData = req.body; 
    const extraPermissions = itemData.extraPermissions; 
    try {
            
            try { 
                if (extraPermissions) {
                    for (let item of extraPermissions) {  
                        console.log(item);
                        if(item.PermissionName){  
                            const extraRequest = new sql.Request(transaction);
                          
                            await extraRequest
                            .input("ID2", sql.NVarChar(65), item.ID2 || null)
                            .input("RolePermissionID", sql.NVarChar(65), rolePermissionID) // from permissions 
                            .input("RoleID", sql.NVarChar(65), roleId) // from permissions 
                            .input("PermissionCode", sql.NVarChar(50), item.PermissionCode)
                            .input("PermissionName", sql.NVarChar(100), item.PermissionName)
                            .input("IsActive", sql.Bit, parseBoolean(item.IsActive) ?? false)
                            .input("CreatedBy", sql.NVarChar(100), req.authUser?.username) 
                            .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  

                            .execute("RoleTransectionExtraPermissions_SaveOrUpdate");
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
// end of applicationRoleExtraPermissionsSaveUpdate

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return lower === "yes" || lower === "true" || lower === "1";
  }
  return Boolean(value);
}

const assignRoleToUser = async (req, res) => {
  const formData = req.body;

  try { 
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    const pool = await sql.connect(config);

    await setTenantContext(pool,req);
     


    // const roleResult = await pool
    //   .request()
    //   .input("ID2", sql.NVarChar(65), formData.ID2 || null)
    //   .input("RoleID", sql.NVarChar(100), formData.RoleID)
    //   .input("UserID", sql.NVarChar(500), formData.UserID || null)
    //   .input("CreatedBy", sql.NVarChar(100), req.authUser.username || "System") 
    //   .execute("UserApplicationRole_SaveOrUpdate");

    const roleResult = await pool
      .request() 
      .input("UserID", sql.NVarChar(500), formData.UserID || null)
      .input("RoleIDs", sql.NVarChar(sql.MAX), formData.RoleIDs)
      .input("OrganizationIDs", sql.NVarChar(sql.MAX), formData.OrganizationIDs)
      .input("BranchIDs", sql.NVarChar(sql.MAX), formData.BranchIDs)
      .input("IsActive", sql.Bit, parseBoolean(formData.IsActive) ? 1 : 0)
      .input("CreatedBy", sql.NVarChar(100), req.authUser.username) 
      .input('TenantId', sql.NVarChar(100), req.authUser.tenantId )  
      
      .execute("UserApplicationRole_SaveOrUpdate_Multi");

      
      
 
    const io = getIO(); 
    if (io) {
        // console.log('inside before emmit'); 
      io.emit("permissionsUpdated", {
        userId: formData.UserID,
        message: `Permissions updated for role`,
      }); 
    }

    res.status(200).json({
      message: "Role Assigned to user saved/updated successfully",
      data: '',
    });
  } catch (error) {
    console.error("Error saving role:", error);
    res.status(400).json({
      message: error.message,
      data: null,
    });
  }
};

const setUserModuleMenuConfig = async (req, res) => {
  const formData = req.body;

  let pool, transaction;

  try {
    // Set DB connection & user context
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    pool = await sql.connect(config);
    transaction = new sql.Transaction(pool);

    await setTenantContext(pool,req);

    
    await transaction.begin();
    
    const modeleRequest = new sql.Request(transaction);
    
    // Save/Update Role
    const modeleResult = await modeleRequest
      .input("UserID", sql.NVarChar(65), req.authUser?.ID2 || null)
      .input("JsonData", sql.NVarChar(sql.MAX), formData.modules) 
      .execute("UserModuleConfig_SaveUpdate");

  
    const menuRequest = new sql.Request(transaction);

    const menuResult = await menuRequest
      .input("UserID", sql.NVarChar(65), req.authUser?.ID2 || null)
      .input("JsonData", sql.NVarChar(sql.MAX), formData.menus) 
      .execute("UserSubMenuConfig_SaveUpdate");

     

    const io = getIO();

    if (io) {
        // console.log('inside before emmit'); 
      io.emit("permissionsUpdated", {
        roleId: req.authUser?.ID2,
        message: `Permissions updated for role ${req.authUser?.ID2}`,
      }); 
    }

    await transaction.commit();


    res.status(200).json({
      message: "User Module Menu setup saved/updated successfully",
      roleID: '',
    });
  } catch (err) { 
      console.error("SQL ERROR DETAILS:", err);
      if (transaction) try { await transaction.rollback(); } catch(e) {}
      
      return res.status(400).json({ 
          message: err.message, 
      }); 
  }
};

// GET all roles
const getRolesList = async (req, res) => {
  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    const pool = await sql.connect(config); 
    await setTenantContext(pool,req);


    const result = await pool.request().query(`EXEC ApplicationRole_Get`);

    // console.log("UsersRoles result:");

    // console.log("UsersRoles result:", result.recordset.length);


    res.status(200).json({
      message: "Roles loaded successfully",
      data: result.recordset,
    });
  } catch (error) {
    res.status(400).json({ message: error.message, data: null });
  }
};


// GET all users
const getUsersRolesList = async (req, res) => {
  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;
    const pool = await sql.connect(config);
    await setTenantContext(pool,req);

    // const result = await pool.request().query(`EXEC UsersRoles_Get`);

    const result = await pool.request()
      .execute("UsersAccessInfo_GetAll");
 
    const parseIDs = (json) => {
      if (!json) return [];

      let parsed;
      try {
        parsed = typeof json === "string" ? JSON.parse(json) : json;
      } catch (err) {
        console.warn("Invalid JSON, returning empty array:", json);
        return [];
      }

      if (Array.isArray(parsed)) return parsed.map(p => p?.ID2 || p);
      if (parsed && parsed.ID2) return [parsed.ID2];
      return [];
    };

 
    const users = result.recordset.map(u => ({
      ID2: u.ID2,
      UserName: u.UserName,
      Email: u.Email,
      IsActive: u.IsActive ?? true,
      RoleIDs: parseIDs(u.RoleIDs),
      OrganizationIDs: parseIDs(u.OrganizationIDs),
      BranchIDs: parseIDs(u.BranchIDs)
    }));

    res.status(200).json({
      message: "User access info loaded successfully",
      data: users
    });
    
  } catch (error) {
    res.status(400).json({ message: error.message, data: null });
  }
};

// GET getUserPermissions
const getUserPermissions = async (req, res) => {
  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;
    const pool = await sql.connect(config);
    await setTenantContext(pool,req);
 
    const result = await pool
                        .request()
                        .input("UserID", sql.NVarChar, req.authUser.ID2)
                        .execute("GetUserModulesMenus");

      
    const usersAccess = await pool
        .request()
        .input("UserID", sql.NVarChar, req.authUser.ID2)
        .execute("UsersAccessInfo_Get");

        // const userInfo = usersAccess.recordsets[0][0];
        // const roles = result.recordsets[1];
        const organizations = usersAccess.recordsets[2];
        const branches = usersAccess.recordsets[3];

    const data = {
      modules:result.recordset,
      organizations:organizations,
      branches:branches, 
    }                                        


    res.status(200).json({
      message: "Users Permissions loaded successfully",
      data: data,
    });
  } catch (error) {
    res.status(400).json({ message: error.message, data: null });
  }
};


// GET role details with permissions
const getRoleDetails = async (req, res) => {
  const { ID2 } = req.body;

  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;
    const pool = await sql.connect(config);
    await setTenantContext(pool,req);

    const roleResult = await pool.request().input("ID2", sql.NVarChar(65), ID2).query(`EXEC ApplicationRole_Get @ID2='${ID2}'`);

    const permissionsResult = await pool.request().input("RoleID", sql.NVarChar(65), ID2).query(`EXEC ApplicationRolePermissions_Get @RoleID='${ID2}'`);
    const extraPermissionsResult = await pool.request().input("RoleID", sql.NVarChar(65), ID2).query(`EXEC RoleTransectionExtraPermissions_Get @RoleID='${ID2}'`);

    // Group extra permissions by RolePermissionID if needed
    
    const permissionsList = permissionsResult.recordset || [];
    const extraPermissionsList = extraPermissionsResult.recordset || [];

    const groupedPermissions = extraPermissionsList.reduce((acc, perm) => {
        if (!acc[perm.TransactionAccessId]) acc[perm.TransactionAccessId] = [];
        acc[perm.TransactionAccessId].push(perm);
        return acc;
    }, {});

    const combinedData = permissionsList.map(access => ({
        ...access,
        extraPermissions: groupedPermissions[access.transactionAccessId] || []
    }));


    res.status(200).json({
      message: "Role details loaded successfully",
      data: {
        roleDetails: roleResult.recordset[0],
        permissions: combinedData,  
      },
    });
  } catch (error) {
    res.status(400).json({ message: error.message, data: null });
  }
};

module.exports = {
  roleSaveOrUpdate,
  assignRoleToUser,
  setUserModuleMenuConfig,
  getRolesList,
  getUsersRolesList,
  getUserPermissions,
  getRoleDetails,
};
