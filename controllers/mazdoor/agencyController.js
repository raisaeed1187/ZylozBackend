const {
    sql, uploadDocument, filesByField, newId,
    getTenantPool, getPortalAuthedPool,
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

const getAgencyDetails = async (req, res) => {
    const { Id } = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("Id", sql.NVarChar(65), Id)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .execute("dbo.usp_Mazdoor_Agency_Details");

        res.status(200).json({
            message: "Agency details loaded successfully!",
            data: (result.recordsets[0] || []).map(toDetailsRow),
            documents: result.recordsets[1],
        });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getAgencyDetails

// Agency-side decision on an assigned Manpower Request — reached from the
// self-service portal, so it runs under the portal JWT, not internal auth.
const agencyAcceptDeclineMpr = async (req, res) => {
    const { manpowerRequestId, decision, comment } = req.body;

    try {
        const pool = await getPortalAuthedPool(req);
        const result = await pool.request()
            .input("ManpowerRequestId", sql.NVarChar(65), manpowerRequestId)
            .input("TenantID", sql.NVarChar(65), req.portalUser.tenantId)
            .input("Decision", sql.NVarChar(10), decision)
            .input("Comment", sql.NVarChar(500), comment || null)
            .execute("dbo.usp_Mazdoor_Agency_AcceptDeclineMpr");

        res.status(200).json({ message: result.recordset[0].Message, data: result.recordset[0] });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of agencyAcceptDeclineMpr

module.exports = { agencySaveUpdate, getAgenciesList, getAgencyDetails, agencyAcceptDeclineMpr };
