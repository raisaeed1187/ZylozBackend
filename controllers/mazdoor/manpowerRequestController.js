const { sql, uploadDocument, fileByField, newId, getTenantPool } = require("./_shared");

// ManpowerRequestCreation.jsx's trade rows use `name`/`count` (see TradeRow.jsx),
// but usp_Mazdoor_ManpowerRequest_SaveUpdate's @Requirements JSON parsing reads
// `tradeName`/`qty` — every other field already matches 1:1. Normalizing here
// keeps the stored proc's contract stable without touching the frontend shape.
function normalizeRequirements(requirementsJson) {
    if (!requirementsJson) return requirementsJson;

    let trades;
    try {
        trades = JSON.parse(requirementsJson);
    } catch (e) {
        return requirementsJson;
    }
    if (!Array.isArray(trades)) return requirementsJson;

    return JSON.stringify(
        trades.map((t) => ({
            ...t,
            tradeName: t.tradeName ?? t.name,
            qty: t.qty ?? t.count,
        }))
    );
}

// Reverse of normalizeRequirements() above — TradeRow.jsx/ManpowerRequestCreation.jsx
// expect trade rows shaped as {id, name, count, benefits: [...], ...camelCase},
// but usp_Mazdoor_ManpowerRequest_Details returns the MazdoorManpowerRequestTrade
// columns as-is (TradeName, Qty, Benefits-as-JSON-text, etc). Without this, editing
// a saved request crashes TradeRow (trade.benefits is undefined, not an array).
function denormalizeTrade(row) {
    let benefits = [];
    if (Array.isArray(row.Benefits)) {
        benefits = row.Benefits;
    } else if (typeof row.Benefits === "string" && row.Benefits) {
        try {
            const parsed = JSON.parse(row.Benefits);
            if (Array.isArray(parsed)) benefits = parsed;
        } catch (e) {
            // leave benefits as []
        }
    }

    return {
        id: row.ID2,
        name: row.TradeName || "",
        count: row.Qty || 0,
        nationality: row.Nationality || "Any",
        salaryMin: row.MinSalary || 0,
        salaryMax: row.MaxSalary || 0,
        salaryCurrency: row.SalaryCurrency || "",
        workingHours: row.WorkingHours || "8",
        otApplicable: !!row.OTApplicable,
        otRate: row.OTRate || "",
        benefits,
        experience: row.Experience || "Entry",
        gccExperience: row.GccExperience || "Not Required",
        skills: row.Skills || "",
        medicalReqs: row.MedicalReqs || "",
        gamca: !!row.Gamca,
        pcc: !!row.Pcc,
        jdText: row.JdText || "",
        jdFile: row.JdFileUrl || "",
    };
}

// Same reverse-mapping need as denormalizeTrade() above, but for the MPR header
// itself — ManpowerRequestCreation.jsx's edit-populate effect reads camelCase
// (details.requestTitle, details.clientName, ...) off of this object.
function toDateInputValue(value) {
    if (!value) return "";
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
}

function denormalizeManpowerRequestHeader(row) {
    if (!row) return null;
    return {
        ...row,
        id: row.ID2,
        requestTitle: row.Title || "",
        clientId: row.ClientId || "",
        clientName: row.ClientName || "",
        agencyId: row.AgencyID || "",
        destination: row.Destination || "",
        currency: row.Currency || "",
        priority: row.Priority || "Normal",
        projectName: row.ProjectLocation || "",
        joiningDate: toDateInputValue(row.TargetJoiningDate),
        statusId: row.StatusId || "Draft",
        organizationId: row.OrganizationID || "",
        branchId: row.BranchId || "",
        comments: row.Comments || "",
    };
}

// ManpowerRequestCreation.jsx's "Save Draft" / "Submit Request" buttons call
// handleSubmit(1) / handleSubmit(2) — numeric codes, not the status text the
// stored proc's @StatusId (and every list/detail screen reading it back)
// expects. Map those codes here; anything else (e.g. a status string an
// internal-admin workflow sets directly) passes through unchanged.
const STATUS_CODE_MAP = { 1: "Draft", 2: "Submitted" };
function normalizeStatusId(statusId) {
    if (statusId === undefined || statusId === null || statusId === "") return "Draft";
    return STATUS_CODE_MAP[statusId] || String(statusId);
}

const manpowerRequestSaveUpdate = async (req, res) => {
    const formData = req.body;

    try {
        const pool = await getTenantPool(req);

        const result = await pool.request()
            .input("ID2", sql.NVarChar(65), formData.ID2 || null)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .input("OrganizationID", sql.NVarChar(65), formData.organizationId || null)
            .input("BranchId", sql.NVarChar(65), formData.branchId || null)
            .input("Title", sql.NVarChar(200), formData.requestTitle)
            .input("ClientId", sql.NVarChar(65), formData.clientId || null)
            .input("ClientName", sql.NVarChar(200), formData.clientName || null)
            .input("AgencyID", sql.NVarChar(65), formData.agencyId || null)
            .input("Destination", sql.NVarChar(100), formData.destination || null)
            .input("Currency", sql.NVarChar(10), formData.currency || null)
            .input("Priority", sql.NVarChar(20), formData.priority || null)
            .input("ProjectLocation", sql.NVarChar(200), formData.projectName || formData.projectLocation || null)
            .input("TargetJoiningDate", sql.Date, formData.joiningDate || null)
            .input("StatusId", sql.NVarChar(30), normalizeStatusId(formData.statusId))
            .input("Comments", sql.NVarChar(sql.MAX), formData.comments || null)
            .input("Requirements", sql.NVarChar(sql.MAX), normalizeRequirements(formData.requirements) || null)
            .input("CreatedBy", sql.NVarChar(100), req.authUser.username)
            .execute("dbo.usp_Mazdoor_ManpowerRequest_SaveUpdate");

        const saved = result.recordset[0];

        // ManpowerRequestCreation.jsx sends each of its three upload slots as
        // its own field (demandLetter/authorizationLetter/additionalDocument)
        // rather than one flat "attachments" array, so each saved row can be
        // tagged with the right DocType.
        const docSlots = [
            { field: "demandLetter", docType: "DemandLetter" },
            { field: "authorizationLetter", docType: "AuthorizationLetter" },
            { field: "additionalDocument", docType: "Other" },
        ];

        for (const slot of docSlots) {
            const file = fileByField(req, slot.field);
            if (!file) continue;

            const doc = await uploadDocument(file);
            await pool.request()
                .input("ID2", sql.NVarChar(65), newId())
                .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
                .input("ManpowerRequestID", sql.NVarChar(65), saved.ID2)
                .input("DocType", sql.NVarChar(30), slot.docType)
                .input("FileName", sql.NVarChar(255), doc.fileName)
                .input("FileUrl", sql.NVarChar(500), doc.fileUrl)
                .input("UploadedBy", sql.NVarChar(100), req.authUser.username)
                .query(`INSERT INTO [dbo].[MazdoorManpowerRequestAttachment] ([ID2],[TenantID],[ManpowerRequestID],[DocType],[FileName],[FileUrl],[UploadedBy])
                        VALUES (@ID2,@TenantID,@ManpowerRequestID,@DocType,@FileName,@FileUrl,@UploadedBy)`);
        }

        res.status(200).json({ message: saved.Message, data: saved });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of manpowerRequestSaveUpdate

const getManpowerRequestsList = async (req, res) => {
    const { organizationId, status } = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .input("OrganizationID", sql.NVarChar(65), organizationId || null)
            .input("Status", sql.NVarChar(30), status || null)
            .execute("dbo.usp_Mazdoor_ManpowerRequest_List");

        res.status(200).json({ message: "Manpower requests list loaded successfully!", data: result.recordset });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getManpowerRequestsList

const getManpowerRequestDetails = async (req, res) => {
    const { Id } = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("Id", sql.NVarChar(65), Id)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .execute("dbo.usp_Mazdoor_ManpowerRequest_Details");

        res.status(200).json({
            message: "Manpower request details loaded successfully!",
            data: {
                manpowerRequestDetails: denormalizeManpowerRequestHeader(result.recordsets[0]?.[0]),
                requirements: (result.recordsets[1] || []).map(denormalizeTrade),
                attachments: result.recordsets[2] || [],
            },
        });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getManpowerRequestDetails

const deleteManpowerRequest = async (req, res) => {
    const { Id } = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("Id", sql.NVarChar(65), Id)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .input("DeletedBy", sql.NVarChar(100), req.authUser.username)
            .execute("dbo.usp_Mazdoor_ManpowerRequest_Delete");

        res.status(200).json({ message: result.recordset[0].Message, data: result.recordset[0] });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of deleteManpowerRequest

module.exports = {
    manpowerRequestSaveUpdate,
    getManpowerRequestsList,
    getManpowerRequestDetails,
    deleteManpowerRequest,
};
