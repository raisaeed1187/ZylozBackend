// Shared plumbing for the Mazdoor module controllers — kept in one place since
// every Mazdoor controller needs the same DB/tenant wiring and (for the portal
// signup/login/documents flows) the same Azure blob upload + subdomain-based
// tenant resolution used by the rest of this app's public/anonymous endpoints.
const sql = require("mssql");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const fs = require("fs");
const crypto = require("crypto");
require("dotenv").config();
const { BlobServiceClient } = require("@azure/storage-blob");
const store = require("../../store");
const { setCurrentDatabase, setCurrentUser } = require("../../constents").actions;
const { setTenantContext } = require("../../helper/db/sqlTenant");
const { helper } = require("../../helper");

const SECRET_KEY = process.env.SECRET_KEY;

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "documents";
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

// Mirrors uploadDocument() in customerController.js — uploads a multer disk
// file to Azure Blob Storage and returns {fileName, fileUrl}.
async function uploadDocument(file) {
    if (!file) return { fileName: "", fileUrl: "" };

    const blobName = file.originalname;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    const uploadStream = fs.createReadStream(file.path);
    await blockBlobClient.uploadStream(uploadStream);
    fs.unlinkSync(file.path);

    return {
        fileName: blobName.split(".").slice(0, -1).join("."),
        fileUrl: blockBlobClient.url,
    };
}

// mazdoorUpload (server.js) is a multer .any() instance, so req.files is a
// flat array of {fieldname, ...} rather than an object keyed by field name.
function filesByField(req, fieldname) {
    return Array.isArray(req.files) ? req.files.filter((f) => f.fieldname === fieldname) : [];
}

function fileByField(req, fieldname) {
    return filesByField(req, fieldname)[0];
}

function newId() {
    return crypto.randomUUID();
}

// Standard internal-staff DB connection — same pattern as every other module
// in this app (agentController.js, customerController.js, etc).
async function getTenantPool(req) {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;
    const pool = await sql.connect(config);
    await setTenantContext(pool, req);
    return pool;
}

// All Mazdoor SQL objects are created in the Allbiz database (see the `USE
// [Allbiz]` header on every usp_Mazdoor_*.sql script), so anonymous portal
// requests (no internal JWT yet) default here — same fallback style as
// homeController.js's public forms defaulting to a fixed tenant database.
const PORTAL_DEFAULT_DATABASE = "Allbiz";

// Resolves a TenantID for an unauthenticated portal request the same way
// sendOTP()'s VendorVerification flow does: connect to the default database,
// then look up the tenant by the request's subdomain.
async function getPortalTenant(req) {
    store.dispatch(setCurrentDatabase(req.body.from || PORTAL_DEFAULT_DATABASE));
    const config = store.getState().constents.config;
    const pool = await sql.connect(config);

    const subdomain = helper.methods.getSubdomain(req);
    const tenantResponse = await pool
        .request()
        .input("DomainPrefix", sql.NVarChar, subdomain)
        .execute("Tenant_GetDetails");

    const tenantId = tenantResponse.recordset?.[0]?.ID2;
    if (!tenantId) {
        throw new Error("Unable to resolve tenant for this domain.");
    }

    await pool
        .request()
        .input("tenantId", sql.NVarChar, tenantId)
        .query(`EXEC sp_set_session_context @key=N'TenantId', @value=@tenantId`);

    return { pool, tenantId };
}

// Login-specific tenant resolution: unlike signup (a brand new visitor with
// no existing row, so subdomain is the only signal available), a portal user
// logging in already has a MazdoorPortalUser row carrying the correct
// TenantID from whenever it was created (self-signup or an admin's Grant
// Portal Access) — looking it up directly by email is both more reliable
// than subdomain matching and works from any host, including localhost,
// where getSubdomain() always returns null (no dots to split on).
async function getPortalTenantByEmail(req, email) {
    store.dispatch(setCurrentDatabase(req.body.from || PORTAL_DEFAULT_DATABASE));
    const config = store.getState().constents.config;
    const pool = await sql.connect(config);

    const result = await pool
        .request()
        .input("Email", sql.NVarChar, email)
        .query(`SELECT TOP 1 [TenantID] FROM [dbo].[MazdoorPortalUser] WHERE [Email] = @Email AND [IsDeleted] = 0`);

    const tenantId = result.recordset?.[0]?.TenantID;
    if (!tenantId) {
        throw new Error("No account found with this email.");
    }

    await pool
        .request()
        .input("tenantId", sql.NVarChar, tenantId)
        .query(`EXEC sp_set_session_context @key=N'TenantId', @value=@tenantId`);

    return { pool, tenantId };
}

// DB connection for an already-logged-in portal user (Agency/Agent), driven
// by the portal JWT payload instead of the internal req.authUser.
async function getPortalAuthedPool(req) {
    store.dispatch(setCurrentDatabase(req.portalUser.database || PORTAL_DEFAULT_DATABASE));
    const config = store.getState().constents.config;
    const pool = await sql.connect(config);
    await pool
        .request()
        .input("tenantId", sql.NVarChar, req.portalUser.tenantId)
        .query(`EXEC sp_set_session_context @key=N'TenantId', @value=@tenantId`);
    return pool;
}

// Separate auth path for the Agency/Agent self-service portal — verifies the
// same SECRET_KEY-signed JWT family as authenticateToken, but never accepts
// an internal-staff token in its place (no agencyId/agentId/principalType on
// those) and attaches req.portalUser instead of req.authUser so the two
// sessions can never be confused downstream.
const authenticatePortalToken = async (req, res, next) => {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ message: "Access Denied. Token not provided.", data: null });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        if (!decoded.principalType) {
            return res.status(403).json({ message: "Invalid portal session.", data: null });
        }
        req.portalUser = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ message: "Session has expired.", data: null });
    }
};

module.exports = {
    sql,
    jwt,
    bcrypt,
    store,
    setCurrentDatabase,
    setCurrentUser,
    setTenantContext,
    uploadDocument,
    filesByField,
    fileByField,
    newId,
    getTenantPool,
    getPortalTenant,
    getPortalTenantByEmail,
    getPortalAuthedPool,
    authenticatePortalToken,
    SECRET_KEY,
};
