const sql = require("mssql");
const express = require("express");
require("dotenv").config();
const store = require("../../store");
const { setCurrentDatabase, setCurrentUser } = require("../../constents").actions;

// const { io } = require("../../socket/socketServer");
const { getIO } = require("../../socket/socket"); 


const roleSaveOrUpdate = async (req, res) => {
  const formData = req.body;

  try {
    // Set DB connection & user context
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    const pool = await sql.connect(config);

    const mainPermissions = JSON.parse(formData.mainPermissions); 
    const extraPermissions = JSON.parse(formData.extraPermissions); 
    
    // Save/Update Role
    const roleResult = await pool
      .request()
      .input("ID2", sql.NVarChar(65), formData.ID2 || null)
      .input("RoleName", sql.NVarChar(100), formData.roleName)
      .input("Description", sql.NVarChar(500), formData.description || null)
      .input("CreatedBy", sql.NVarChar(100), formData.createdBy || req.authUser?.userName || "System") 
      .output("ID", sql.NVarChar(65))
      .execute("ApplicationRole_SaveOrUpdate");

    const newRoleID = roleResult.output.ID;

    // Save/Update Role Permissions
    if (formData.mainPermissions?.length) { 
       await applicationRolePermissionsSaveUpdate(req,newRoleID); 
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


    res.status(200).json({
      message: "Role and permissions saved/updated successfully",
      roleID: '',
    });
  } catch (error) {
    console.error("Error saving role:", error);
    res.status(400).json({
      message: error.message,
      data: null,
    });
  }
};

async function applicationRolePermissionsSaveUpdate(req,roleId){
    const formData = req.body; 
    const mainPermissions = JSON.parse(formData.mainPermissions); 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (mainPermissions) {
                    for (let item of mainPermissions) {  
                        console.log(item);
                        if(item.transactionName){  
                            const rolePermissionResult = await pool
                            .request()
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
                            .input("CreatedBy", sql.NVarChar(100), req.authUser?.userName || "System") 
                            .output("ID", sql.NVarChar(65))
                            .execute("ApplicationRolePermissions_SaveOrUpdate");

                            const newRolePermissionID = rolePermissionResult.output.ID;

                            // Save Extra Permissions if any
                            if (item.extraPermissions?.length) {
                               await applicationRoleExtraPermissionsSaveUpdate(req,roleId,newRolePermissionID,item)
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

async function applicationRoleExtraPermissionsSaveUpdate(req,roleId,rolePermissionID,transection){
    const formData = req.body; 
    const extraPermissions = transection.extraPermissions; 
    try {
            store.dispatch(setCurrentDatabase(req.authUser.database));
            store.dispatch(setCurrentUser(req.authUser)); 
            const config = store.getState().constents.config;  

            const pool = await sql.connect(config);
            try { 
                if (extraPermissions) {
                    for (let item of extraPermissions) {  
                        console.log(item);
                        if(item.PermissionName){  
                            await pool
                            .request()
                            .input("ID2", sql.NVarChar(65), item.ID2 || null)
                            .input("RolePermissionID", sql.NVarChar(65), rolePermissionID) // from permissions 
                            .input("RoleID", sql.NVarChar(65), roleId) // from permissions 
                            .input("PermissionCode", sql.NVarChar(50), item.PermissionCode)
                            .input("PermissionName", sql.NVarChar(100), item.PermissionName)
                            .input("IsActive", sql.Bit, parseBoolean(item.IsActive) ?? false)
                            .input("CreatedBy", sql.NVarChar(100), req.authUser?.userName || "System") 
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
    // Set DB connection & user context
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;

    const pool = await sql.connect(config);
 
    const roleResult = await pool
      .request()
      .input("ID2", sql.NVarChar(65), formData.ID2 || null)
      .input("RoleID", sql.NVarChar(100), formData.RoleID)
      .input("UserID", sql.NVarChar(500), formData.UserID || null)
      .input("CreatedBy", sql.NVarChar(100), req.authUser.username || "System") 
      .execute("UserApplicationRole_SaveOrUpdate");
      

    const io = getIO(); 
    if (io) {
        // console.log('inside before emmit'); 
      io.emit("permissionsUpdated", {
        roleId: formData.RoleID,
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

// GET all roles
const getRolesList = async (req, res) => {
  try {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;
    const pool = await sql.connect(config);

    const result = await pool.request().query(`EXEC ApplicationRole_Get`);
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

    const result = await pool.request().query(`EXEC UsersRoles_Get`);
    res.status(200).json({
      message: "Users Roles loaded successfully",
      data: result.recordset,
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
 
    const result = await pool
                        .request()
                        .input("UserID", sql.NVarChar, req.authUser.ID2)
                        .execute("GetUserModulesMenus");


    res.status(200).json({
      message: "Users Permissions loaded successfully",
      data: result.recordset,
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
  getRolesList,
  getUsersRolesList,
  getUserPermissions,
  getRoleDetails,
};
