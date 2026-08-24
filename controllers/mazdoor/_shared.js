// Shared plumbing for the Mazdoor module controllers — kept in one place since
// every Mazdoor controller needs the same DB/tenant wiring and (for the portal
// signup flow) the same Azure blob upload used elsewhere in this app.
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

// Plain DB connection for an unauthenticated portal request (no internal JWT
// to read a database from yet) — same fallback style as homeController.js's
// public forms defaulting to a fixed tenant database.
async function getPortalPool(req) {
    store.dispatch(setCurrentDatabase(req.body.from || PORTAL_DEFAULT_DATABASE));
    const config = store.getState().constents.config;
    return sql.connect(config);
}

// Creates a brand-new Tenant (+ its default Organization) for a
// self-registered Mazdoor Agency/Agent — mirrors authController.js's
// tenantCreation flow (Tenants_SaveOrUpdate + Tenant_OrganizationProfile_Save_Update),
// minus the OTP-verification-email step (not relevant here).
//
// This is the Mazdoor portal's actual multi-tenancy model: an Agency/Agent an
// admin creates directly (grantAgencyPortalAccess/grantAgentPortalAccess)
// stays private to that admin's own tenant, but one that self-registers via
// the public portal becomes its OWN independent tenant — so it isn't tied to
// whichever Requester happened to be first, and can be discovered/assigned
// work by any Requester (see the marketplace visibility queries in
// agencyController.js/agentController.js's *ForAssignment functions).
async function createPortalTenant(pool, { tenantName, email, phone, country, city, createdBy }) {
    const tenantResult = await pool.request()
        .input("ID2", sql.NVarChar, null)
        .input("TenantCode", sql.NVarChar, null)
        .input("TenantName", sql.NVarChar, tenantName)
        .input("FullName", sql.NVarChar, createdBy || null)
        .input("DomainName", sql.NVarChar, null)
        .input("IsActive", sql.Bit, 1)
        .input("Email", sql.NVarChar, email)
        .input("Phone", sql.NVarChar, phone || null)
        .input("Country", sql.NVarChar, country || null)
        .input("City", sql.NVarChar, city || null)
        .input("LogoUrl", sql.NVarChar, null)
        .input("ThemeConfig", sql.NVarChar(sql.MAX), null)
        .input("UserId", sql.NVarChar, createdBy || "System")
        .output("ID", sql.NVarChar(100))
        .execute("Tenants_SaveOrUpdate");

    const tenantId = tenantResult.output.ID;

    const organizationResult = await pool.request()
        .input("ID2", sql.NVarChar(250), null)
        .input("OrganizationName", sql.NVarChar(250), tenantName)
        .input("ContactNo", sql.NVarChar(250), phone || null)
        .input("Email", sql.NVarChar(250), email)
        .input("Country", sql.NVarChar(250), country || null)
        .input("LicensesNumber", sql.NVarChar(250), null)
        .input("TRNNumber", sql.NVarChar(250), null)
        .input("Logo", sql.NVarChar(250), null)
        .input("CreatedBy", sql.NVarChar(250), createdBy || "System")
        .input("tenantId", sql.NVarChar(65), tenantId)
        .execute("Tenant_OrganizationProfile_Save_Update");

    const organizationId = organizationResult.recordset[0]?.ID || null;

    return { tenantId, organizationId };
}

 
// ─────────────────────────────────────────────────────────────────────────
// Mazdoor Portal auth: instead of a separate MazdoorPortalUser table/JWT
// scheme, Agency/Agent portal principals are registered as ordinary rows in
// the app's own Users table and authenticate through the same
// User_Registeration / User_login / GetUserModulesMenus machinery every
// internal staff login already goes through — Users.AgentId/AgencyId are
// first-class columns on that proc specifically for this. The only
// Mazdoor-specific piece is auto-provisioning a portal-only role so the
// standard login's module-count gate doesn't reject a freshly registered
// Agency/Agent for having no permissions assigned yet.
// ─────────────────────────────────────────────────────────────────────────

// Fixed catalog IDs created once by mazdoor-portal-onetime-setup.sql
// (MainModule 'Mazdoor' -> Transections 'Mazdoor Portal Access' ->
// TransactionAccess). Every tenant's auto-created role below grants
// ViewAccess on this single shared TransactionAccess row.
const MAZDOOR_PORTAL_TRANSACTION_ACCESS_ID = "f2607134-18a4-4af9-9726-4e3eefeed3d5";
const MAZDOOR_PORTAL_ROLE_NAME = "Mazdoor Portal Access";

// Finds (or lazily creates, once per tenant) the "Mazdoor Portal Access"
// role. ApplicationRole/ApplicationRolePermissions are tenant-scoped (unlike
// the shared Transections/TransactionAccess catalog), so this runs per
// tenant but only actually inserts anything the first time.
async function ensureMazdoorPortalRole(pool, tenantId, createdBy) {
    const existing = await pool.request()
        .input("RoleName", sql.NVarChar(100), MAZDOOR_PORTAL_ROLE_NAME)
        .input("TenantId", sql.NVarChar(100), tenantId)
        .query(`SELECT TOP 1 [ID2] FROM [dbo].[ApplicationRole] WHERE [RoleName] = @RoleName AND [TenantId] = @TenantId`);

    if (existing.recordset[0]?.ID2) {
        return existing.recordset[0].ID2;
    }

    const roleResult = await pool.request()
        .input("ID2", sql.NVarChar(65), null)
        .input("RoleName", sql.NVarChar(100), MAZDOOR_PORTAL_ROLE_NAME)
        .input("Description", sql.NVarChar(500), "Auto-created — grants Mazdoor Agency/Agent portal users just enough access to sign in.")
        .input("CreatedBy", sql.NVarChar(100), createdBy || "System")
        .input("TenantId", sql.NVarChar(100), tenantId)
        .output("ID", sql.NVarChar(100))
        .execute("ApplicationRole_SaveOrUpdate");

    const roleId = roleResult.output.ID;

    await pool.request()
        .input("ID2", sql.NVarChar(65), null)
        .input("RoleID", sql.NVarChar(65), roleId)
        .input("TransactionID", sql.NVarChar(65), MAZDOOR_PORTAL_TRANSACTION_ACCESS_ID)
        .input("TransactionName", sql.NVarChar(100), MAZDOOR_PORTAL_ROLE_NAME)
        .input("FullAccess", sql.Bit, 0)
        .input("ViewAccess", sql.Bit, 1)
        .input("AddAccess", sql.Bit, 0)
        .input("EditAccess", sql.Bit, 0)
        .input("DeleteAccess", sql.Bit, 0)
        .input("ExportAccess", sql.Bit, 0)
        .input("PrintAccess", sql.Bit, 0)
        .input("CreatedBy", sql.NVarChar(100), createdBy || "System")
        .input("TenantId", sql.NVarChar(100), tenantId)
        .output("ID", sql.NVarChar(100))
        .execute("ApplicationRolePermissions_SaveOrUpdate");

    return roleId;
}

// Registers a Mazdoor Agency/Agent principal as a standard Users-table login
// — "the already-working authentication process" — then assigns the portal
// role and activates the account (User_Registeration doesn't set IsActive
// itself; UserApplicationRole_SaveOrUpdate_Multi is what flips it on, same
// as it does for any normal internal user/role assignment).
async function registerPortalUser(pool, { tenantId, organizationId, database, email, password, fullName, agencyId, agentId, createdBy }) {
    const passwordHash = await bcrypt.hash(password, 10);

    const request = pool.request();
    request.input("ID2", sql.NVarChar(100), "0");
    request.input("username", sql.NVarChar(100), email);
    request.input("email", sql.NVarChar(100), email);
    request.input("password", sql.NVarChar(255), passwordHash);
    request.input("client", sql.NVarChar(100), database);
    request.input("employeeId", sql.NVarChar(100), null);
    request.input("agencyId", sql.NVarChar(100), agencyId || null);
    request.input("agentId", sql.NVarChar(100), agentId || null);
    request.input("TenantId", sql.NVarChar(100), tenantId);
    request.input("fullName", sql.NVarChar(250), fullName || null);
    request.input("isAdmin", sql.Bit, 0);
    request.output("ID", sql.NVarChar(100));
    const result = await request.execute("User_Registeration");

    const newUserId = result.output.ID;

    const roleId = await ensureMazdoorPortalRole(pool, tenantId, createdBy);

    await pool.request()
        .input("UserID", sql.NVarChar(500), newUserId)
        .input("RoleIDs", sql.NVarChar(sql.MAX), roleId)
        .input("OrganizationIDs", sql.NVarChar(sql.MAX), organizationId || null)
        .input("BranchIDs", sql.NVarChar(sql.MAX), null)
        .input("IsActive", sql.Bit, 1)
        .input("CreatedBy", sql.NVarChar(100), createdBy || email)
        .input("TenantId", sql.NVarChar(100), tenantId)
        .execute("UserApplicationRole_SaveOrUpdate_Multi");

    return newUserId;
}

// Resolves the TenantID a Manpower Request's own sub-resources (details,
// trade assignments, Sub-MPR generation, ...) should be queried/written
// under. An internal Requester caller's own tenantId is always correct
// (every MPR they touch is their own tenant's). An Agency portal caller is
// usually a DIFFERENT tenant (self-registered agencies get their own — see
// createPortalTenant above), so this resolves and verifies ownership by
// AgencyID instead — same pattern already proven in
// agencyController.js's agencyAcceptDeclineMpr /
// agentTradeAssignmentController.js's subMprAcceptDecline.
async function resolveManpowerRequestTenantId(pool, req, manpowerRequestId) {
    if (!req.authUser.agencyId) {
        return req.authUser.tenantId;
    }
    const owner = await pool.request()
        .input("Id", sql.NVarChar(65), manpowerRequestId)
        .query(`SELECT [AgencyID], [TenantID] FROM [dbo].[MazdoorManpowerRequest] WHERE [ID2] = @Id AND [IsDeleted] = 0`);
    const mpr = owner.recordset[0];
    if (!mpr || mpr.AgencyID !== req.authUser.agencyId) {
        throw new Error("This request isn't assigned to your agency.");
    }
    return mpr.TenantID;
}

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
    getPortalPool,
    createPortalTenant,
    registerPortalUser,
    resolveManpowerRequestTenantId,
    PORTAL_DEFAULT_DATABASE,
    SECRET_KEY,
};
