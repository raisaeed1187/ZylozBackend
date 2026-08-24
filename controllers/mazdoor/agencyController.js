const {
    sql, uploadDocument, filesByField, newId,
    getTenantPool, registerPortalUser,
} = require("./_shared");

// AgenciesList.jsx / AgencySelector.jsx (list) and AgencyCreation.jsx (details)
// read camelCase fields (agencyName, contactPerson, ...) but the stored procs
// return the MazdoorAgency columns as-is (AgencyName, ContactPerson, ...) —
// same class of mismatch already fixed for manpower requests/candidates.
function toListRow(row) {
    return {
        ...row,
        id: row.ID2,
        agencyName: row.AgencyName || "",
        agencyType: row.AgencyType || "",
        licenseNumber: row.LicenseNumber || "",
        countryOfRegistration: row.CountryOfRegistration || "",
        contactPerson: row.ContactPerson || "",
        email: row.Email || "",
        phone: row.Phone || "",
        city: row.City || "",
        statusId: row.StatusId || "",
        createdAt: row.CreatedAt,
    };
}

function toDetailsRow(row) {
    if (!row) return null;
    return {
        ...row,
        id: row.ID2,
        agencyName: row.AgencyName || "",
        agencyType: row.AgencyType || "",
        licenseNumber: row.LicenseNumber || "",
        countryOfRegistration: row.CountryOfRegistration || "",
        yearEstablished: row.YearEstablished || "",
        websiteUrl: row.WebsiteUrl || "",
        contactPerson: row.ContactPerson || "",
        designation: row.Designation || "",
        email: row.Email || "",
        phone: row.Phone || "",
        whatsapp: row.Whatsapp || "",
        address: row.Address || "",
        city: row.City || "",
        state: row.State || "",
        // Left as the raw JSON-array text the proc stores them as —
        // AgencyCreation.jsx's parseArrayField() already handles both
        // a JSON string and a real array for these three fields.
        countriesOfExpertise: row.CountriesOfExpertise,
        tradesSpecialization: row.TradesSpecialization,
        monthlyCapacity: row.MonthlyCapacity || "",
        languages: row.Languages,
        notes: row.Notes || "",
        statusId: row.StatusId || "",
        organizationId: row.OrganizationID || "",
    };
}

const agencySaveUpdate = async (req, res) => {
    const formData = req.body;

    try {
        const pool = await getTenantPool(req);

        const result = await pool.request()
            .input("ID2", sql.NVarChar(65), formData.ID2 || null)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .input("OrganizationID", sql.NVarChar(65), formData.organizationId || null)
            .input("AgencyName", sql.NVarChar(200), formData.agencyName)
            .input("AgencyType", sql.NVarChar(50), formData.agencyType || null)
            .input("LicenseNumber", sql.NVarChar(100), formData.licenseNumber || formData.licenseNo)
            .input("CountryOfRegistration", sql.NVarChar(100), formData.countryOfRegistration || formData.opCountry || null)
            .input("YearEstablished", sql.NVarChar(4), formData.yearEstablished || null)
            .input("WebsiteUrl", sql.NVarChar(255), formData.websiteUrl || null)
            .input("ContactPerson", sql.NVarChar(150), formData.contactPerson)
            .input("Designation", sql.NVarChar(100), formData.designation || null)
            .input("Email", sql.NVarChar(150), formData.email || formData.agencyEmail)
            .input("Phone", sql.NVarChar(30), formData.phone || formData.agencyPhone)
            .input("Whatsapp", sql.NVarChar(30), formData.whatsapp || null)
            .input("Address", sql.NVarChar(500), formData.address || null)
            .input("City", sql.NVarChar(100), formData.city || null)
            .input("State", sql.NVarChar(100), formData.state || null)
            .input("CountriesOfExpertise", sql.NVarChar(sql.MAX), formData.countriesOfExpertise || null)
            .input("TradesSpecialization", sql.NVarChar(sql.MAX), formData.tradesSpecialization || null)
            .input("MonthlyCapacity", sql.NVarChar(20), formData.monthlyCapacity || null)
            .input("Languages", sql.NVarChar(sql.MAX), formData.languages || null)
            .input("Notes", sql.NVarChar(sql.MAX), formData.notes || null)
            .input("IsPortalSignup", sql.Bit, 0)
            .input("CreatedBy", sql.NVarChar(100), req.authUser.username)
            .execute("dbo.usp_Mazdoor_Agency_SaveUpdate");

        const saved = result.recordset[0];

        const documents = filesByField(req, "documents");
        if (documents.length > 0) {
            const uploaded = await Promise.all(documents.map((f) => uploadDocument(f)));
            for (const doc of uploaded) {
                await pool.request()
                    .input("ID2", sql.NVarChar(65), newId())
                    .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
                    .input("AgencyID", sql.NVarChar(65), saved.ID2)
                    .input("FileName", sql.NVarChar(255), doc.fileName)
                    .input("FileUrl", sql.NVarChar(500), doc.fileUrl)
                    .query(`INSERT INTO [dbo].[MazdoorAgencyDocument] ([ID2],[TenantID],[AgencyID],[FileName],[FileUrl])
                            VALUES (@ID2,@TenantID,@AgencyID,@FileName,@FileUrl)`);
            }
        }

        res.status(200).json({ message: saved.Message, data: saved });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of agencySaveUpdate

const getAgenciesList = async (req, res) => {
    const { organizationId } = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .input("OrganizationID", sql.NVarChar(65), organizationId || null)
            .execute("dbo.usp_Mazdoor_Agency_List");

        res.status(200).json({ message: "Agencies list loaded successfully!", data: result.recordset.map(toListRow) });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getAgenciesList

// Marketplace visibility for the "Submit to Agency" picker (AgencySelector.jsx)
// — unlike getAgenciesList above (a Requester's own private roster,
// usp_Mazdoor_Agency_List, tenant-scoped), this also surfaces agencies that
// self-registered via the public portal: each one is its own independent
// tenant (see createPortalTenant in _shared.js), identified here by having a
// Users login whose AgencyId/TenantId point back at itself. Backed by
// usp_Mazdoor_Agency_ListForAssignment (sql/usp_Mazdoor_Agency_ListForAssignment.sql).
const getAgenciesForAssignment = async (req, res) => {
    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .execute("dbo.usp_Mazdoor_Agency_ListForAssignment");

        res.status(200).json({ message: "Agencies list loaded successfully!", data: result.recordset.map(toListRow) });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getAgenciesForAssignment

const getAgencyDetails = async (req, res) => {
    const { Id } = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("Id", sql.NVarChar(65), Id)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .execute("dbo.usp_Mazdoor_Agency_Details");

        // No proc covers this lookup, so it's a plain query alongside the
        // proc call (same pattern as the document-attachment inserts) — lets
        // AgencyCreation.jsx show whether this agency already has a portal
        // login instead of the admin finding out only when Grant fails.
        // Portal login is now a standard Users-table row (see
        // registerPortalUser in _shared.js), so this reads Users instead of
        // the retired MazdoorPortalUser table.
        const portalUser = await pool.request()
            .input("AgencyID", sql.NVarChar(65), Id)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .query(`SELECT TOP 1 [ID2], [Email], [IsActive]
                    FROM [dbo].[Users]
                    WHERE [AgencyId] = @AgencyID AND [TenantId] = @TenantID`);
        const portalUserRow = portalUser.recordset[0];

        res.status(200).json({
            message: "Agency details loaded successfully!",
            data: (result.recordsets[0] || []).map(toDetailsRow),
            documents: result.recordsets[1],
            portalAccess: portalUserRow
                ? { Email: portalUserRow.Email, Status: portalUserRow.IsActive ? "Active" : "Suspended" }
                : null,
        });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getAgencyDetails

// Agency-side decision on an assigned Manpower Request — reached from the
// self-service portal. Runs under the standard authenticateToken now (the
// portal login issues the same kind of token as internal staff — see
// portalController.js), so the ownership check below (does this caller's own
// agencyId match the target MPR's assigned agency) matters: nothing in
// usp_Mazdoor_Agency_AcceptDeclineMpr itself verifies that on its own.
const agencyAcceptDeclineMpr = async (req, res) => {
    const { manpowerRequestId, decision, comment } = req.body;

    try {
        if (!req.authUser.agencyId) {
            return res.status(403).json({ message: "Only an Agency portal account can decide on a request.", data: null });
        }

        const pool = await getTenantPool(req);

        // The MPR belongs to the REQUESTER's tenant, which usually isn't this
        // agency's own tenant (a self-registered agency has its own — see
        // createPortalTenant in _shared.js) — so ownership is verified by
        // AgencyID match alone (ID2 is a globally unique GUID, safe to look up
        // without a tenant filter), and the MPR's own TenantID is what gets
        // passed to the decision proc below, not req.authUser.tenantId.
        const owner = await pool.request()
            .input("Id", sql.NVarChar(65), manpowerRequestId)
            .query(`SELECT [AgencyID], [TenantID] FROM [dbo].[MazdoorManpowerRequest] WHERE [ID2] = @Id AND [IsDeleted] = 0`);
        const mpr = owner.recordset[0];
        if (!mpr || mpr.AgencyID !== req.authUser.agencyId) {
            return res.status(403).json({ message: "This request isn't assigned to your agency.", data: null });
        }

        const result = await pool.request()
            .input("ManpowerRequestId", sql.NVarChar(65), manpowerRequestId)
            .input("TenantID", sql.NVarChar(65), mpr.TenantID)
            .input("Decision", sql.NVarChar(10), decision)
            .input("Comment", sql.NVarChar(500), comment || null)
            .execute("dbo.usp_Mazdoor_Agency_AcceptDeclineMpr");

        res.status(200).json({ message: result.recordset[0].Message, data: result.recordset[0] });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of agencyAcceptDeclineMpr

// Lets an internal admin create login credentials for an agency they created
// directly (AgencyCreation.jsx) rather than one that self-registered via the
// portal — those never get a Users-table login otherwise. Re-running this for
// an agency that already has portal access fails cleanly via
// User_Registeration's own "already registered" check — no extra guard needed.
const grantAgencyPortalAccess = async (req, res) => {
    const { agencyId, email, password } = req.body;

    try {
        if (!password || password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters.", data: null });
        }

        const pool = await getTenantPool(req);

        // registerPortalUser needs the agency's own OrganizationID to assign
        // it on the new login (UserOrganization row) — an admin-created
        // agency already has one set by agencySaveUpdate, unlike a
        // self-registered one which gets a brand-new tenant+org at signup
        // time (see createPortalTenant/portalSignup).
        const agencyRow = await pool.request()
            .input("Id", sql.NVarChar(65), agencyId)
            .query(`SELECT [OrganizationID] FROM [dbo].[MazdoorAgency] WHERE [ID2] = @Id`);
        const organizationId = agencyRow.recordset[0]?.OrganizationID || null;

        await registerPortalUser(pool, {
            tenantId: req.authUser.tenantId,
            organizationId,
            database: req.authUser.database,
            email,
            password,
            agencyId,
            createdBy: req.authUser.username,
        });

        res.status(200).json({ message: "Portal access granted successfully!", data: { agencyId, email } });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of grantAgencyPortalAccess

module.exports = {
    agencySaveUpdate, getAgenciesList, getAgencyDetails, agencyAcceptDeclineMpr,
    grantAgencyPortalAccess, getAgenciesForAssignment,
};
