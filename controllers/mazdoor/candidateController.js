const { sql, uploadDocument, fileByField, getTenantPool } = require("./_shared");

const candidateSaveUpdate = async (req, res) => {
    const formData = req.body;

    try {
        const pool = await getTenantPool(req);

        const photoFile = fileByField(req, "photo");
        const photoUrl = photoFile ? (await uploadDocument(photoFile)).fileUrl : null;

        const passportDocFile = fileByField(req, "passportDoc");
        const passportDocUrl = passportDocFile ? (await uploadDocument(passportDocFile)).fileUrl : null;

        const result = await pool.request()
            .input("ID2", sql.NVarChar(65), formData.candidateId || null)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .input("OnboardingScreenId", sql.NVarChar(65), formData.onboardingScreenId)
            .input("PhotoUrl", sql.NVarChar(500), photoUrl)
            .input("Name", sql.NVarChar(150), formData.name)
            .input("Dob", sql.Date, formData.dob || null)
            .input("Nationality", sql.NVarChar(50), formData.nationality || null)
            .input("Passport", sql.NVarChar(30), formData.passport || null)
            .input("PassportDocUrl", sql.NVarChar(500), passportDocUrl)
            .input("PassportExpiry", sql.Date, formData.passportExpiry || null)
            .input("Trade", sql.NVarChar(100), formData.trade || null)
            .input("Salary", sql.Decimal(18, 2), formData.salary || null)
            .input("Agency", sql.NVarChar(200), formData.agency || null)
            .input("CreatedBy", sql.NVarChar(100), req.authUser.username)
            .execute("dbo.usp_Mazdoor_Candidate_SaveUpdate");

        res.status(200).json({ message: result.recordset[0].Message, data: result.recordset[0] });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of candidateSaveUpdate

const getCandidatesList = async (req, res) => {
    const { onboardingScreenId } = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("OnboardingScreenId", sql.NVarChar(65), onboardingScreenId)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .execute("dbo.usp_Mazdoor_Candidate_List");

        const candidates = result.recordsets[0] || [];
        const stageCells = result.recordsets[1] || [];
        const stageDefinitions = result.recordsets[2] || [];

        const merged = candidates.map((c) => ({
            ...c,
            stages: stageCells
                .filter((s) => s.CandidateID === c.ID2)
                .map((s) => ({
                    stageId: s.StageId,
                    status: s.Status,
                    date: s.StageDate,
                    attachmentName: s.AttachmentName,
                    attachmentUrl: s.AttachmentUrl,
                })),
        }));

        res.status(200).json({
            message: "Candidates list loaded successfully!",
            data: merged,
            stageDefinitions,
        });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getCandidatesList

const deleteCandidate = async (req, res) => {
    const { Id } = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("Id", sql.NVarChar(65), Id)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .execute("dbo.usp_Mazdoor_Candidate_Delete");

        res.status(200).json({ message: result.recordset[0].Message, data: result.recordset[0] });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of deleteCandidate

const candidateStageUpdate = async (req, res) => {
    const formData = req.body;

    try {
        const pool = await getTenantPool(req);

        const attachmentFile = fileByField(req, "attachment");
        const attachment = attachmentFile ? await uploadDocument(attachmentFile) : null;

        const result = await pool.request()
            .input("CandidateId", sql.NVarChar(65), formData.candidateId)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .input("StageId", sql.NVarChar(50), formData.stageId)
            .input("Status", sql.NVarChar(20), formData.status)
            .input("StageDate", sql.Date, formData.date || null)
            .input("AttachmentName", sql.NVarChar(255), attachment?.fileName || null)
            .input("AttachmentUrl", sql.NVarChar(500), attachment?.fileUrl || null)
            .input("UpdatedBy", sql.NVarChar(100), req.authUser.username)
            .execute("dbo.usp_Mazdoor_CandidateStage_Update");

        res.status(200).json({ message: result.recordset[0].Message, data: result.recordset[0] });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of candidateStageUpdate

const getOnboardingScreensList = async (req, res) => {
    const { organizationId, manpowerRequestId, subMprCode } = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .input("OrganizationID", sql.NVarChar(65), organizationId || null)
            .input("ManpowerRequestId", sql.NVarChar(65), manpowerRequestId || null)
            .input("SubMprCode", sql.NVarChar(30), subMprCode || null)
            .execute("dbo.usp_Mazdoor_OnboardingScreen_List");

        res.status(200).json({ message: "Onboarding screens list loaded successfully!", data: result.recordset });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getOnboardingScreensList

const onboardingScreenSaveUpdate = async (req, res) => {
    const formData = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .input("OrganizationID", sql.NVarChar(65), formData.organizationId || null)
            .input("ManpowerRequestId", sql.NVarChar(65), formData.manpowerRequestId || null)
            .input("SubMprCode", sql.NVarChar(30), formData.subMprCode || null)
            .input("CreatedByRole", sql.NVarChar(20), formData.createdByRole || null)
            .input("CreatedByName", sql.NVarChar(150), formData.createdByName || null)
            .execute("dbo.usp_Mazdoor_OnboardingScreen_SaveUpdate");

        res.status(200).json({ message: result.recordset[0].Message, data: result.recordset[0] });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of onboardingScreenSaveUpdate

module.exports = {
    candidateSaveUpdate,
    getCandidatesList,
    deleteCandidate,
    candidateStageUpdate,
    getOnboardingScreensList,
    onboardingScreenSaveUpdate,
};
