const { sql, uploadDocument, fileByField, getTenantPool, resolveOnboardingScreenTenantId } = require("./_shared");

const candidateSaveUpdate = async (req, res) => {
    const formData = req.body;

    try {
        const pool = await getTenantPool(req);
        // See resolveOnboardingScreenTenantId in _shared.js — an Agency/Agent
        // portal caller onboarding candidates for a request/sub-MPR assigned
        // to it usually has a different tenant than the Requester who owns it.
        const tenantId = await resolveOnboardingScreenTenantId(pool, req, formData.onboardingScreenId);

        const photoFile = fileByField(req, "photo");
        const photoUrl = photoFile ? (await uploadDocument(photoFile)).fileUrl : null;

        const passportDocFile = fileByField(req, "passportDoc");
        const passportDocUrl = passportDocFile ? (await uploadDocument(passportDocFile)).fileUrl : null;

        const result = await pool.request()
            .input("ID2", sql.NVarChar(65), formData.candidateId || null)
            .input("TenantID", sql.NVarChar(65), tenantId)
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
        const tenantId = await resolveOnboardingScreenTenantId(pool, req, onboardingScreenId);
        const result = await pool.request()
            .input("OnboardingScreenId", sql.NVarChar(65), onboardingScreenId)
            .input("TenantID", sql.NVarChar(65), tenantId)
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
    const { Id, onboardingScreenId } = req.body;

    try {
        const pool = await getTenantPool(req);
        const tenantId = await resolveOnboardingScreenTenantId(pool, req, onboardingScreenId);
        const result = await pool.request()
            .input("Id", sql.NVarChar(65), Id)
            .input("TenantID", sql.NVarChar(65), tenantId)
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
        const tenantId = await resolveOnboardingScreenTenantId(pool, req, formData.onboardingScreenId);

        const attachmentFile = fileByField(req, "attachment");
        const attachment = attachmentFile ? await uploadDocument(attachmentFile) : null;

        const result = await pool.request()
            .input("CandidateId", sql.NVarChar(65), formData.candidateId)
            .input("TenantID", sql.NVarChar(65), tenantId)
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

// Real "which trades can this onboarding screen's candidates be assigned to"
// list for CandidateOnboarding.jsx's Trade dropdown — was previously showing
// every trade from a mock catalog regardless of what's actually assigned.
// An onboardingScreenId is either a Sub-MPR's SubMprCode (Agent portal, or an
// Agency drilling into one specific agent's slice — see
// resolveOnboardingScreenTenantId in _shared.js), in which case only the
// trades actually assigned to that agent apply, or the main MPR's own ID2
// (Agency portal's own request), in which case every trade required on the
// request applies.
const getOnboardingTrades = async (req, res) => {
    const { onboardingScreenId } = req.body;

    try {
        const pool = await getTenantPool(req);
        const tenantId = await resolveOnboardingScreenTenantId(pool, req, onboardingScreenId);

        // Same join already proven correct in agentTradeAssignmentController.js's
        // getAgentSubMprs, scoped down to this one Sub-MPR. Bound as
        // NVarChar(65) (not the SubMprCode column's real NVarChar(30)) since
        // onboardingScreenId is just as often the main MPR's own 36-char
        // GUID (Agency portal) — binding that to a 30-length parameter
        // overflows and throws a TDS error before the query (which simply
        // won't match) ever runs.
        const subRes = await pool.request()
            .input("SubMprCode", sql.NVarChar(65), onboardingScreenId)
            .input("TenantID", sql.NVarChar(65), tenantId)
            .query(`
                SELECT t.[TradeName] AS name, a.[AssignedQty] AS count
                FROM [dbo].[MazdoorAgentTradeAssignment] a
                INNER JOIN [dbo].[MazdoorManpowerRequestTrade] t ON t.[ID2] = a.[ManpowerRequestTradeID]
                WHERE a.[SubMprCode] = @SubMprCode AND a.[TenantID] = @TenantID AND a.[IsDeleted] = 0
            `);

        if (subRes.recordset.length > 0) {
            return res.status(200).json({ message: "Trades loaded successfully!", data: subRes.recordset });
        }

        // Not a Sub-MPR code — onboardingScreenId is the main MPR's own ID2.
        // Reuses usp_Mazdoor_ManpowerRequest_Details (already proven correct
        // elsewhere) rather than re-deriving MazdoorManpowerRequestTrade's own
        // column layout by hand.
        const mprRes = await pool.request()
            .input("Id", sql.NVarChar(65), onboardingScreenId)
            .input("TenantID", sql.NVarChar(65), tenantId)
            .execute("dbo.usp_Mazdoor_ManpowerRequest_Details");
        const tradeRows = mprRes.recordsets[1] || [];

        // A trade's required qty already delegated to agents (via Sub-MPR
        // assignments) is THEIR responsibility to onboard, not the agency's —
        // without subtracting it here, the agency's own screen would cap at
        // the FULL required qty regardless of what's been delegated away,
        // letting the same headcount be onboarded twice (e.g. required 7,
        // 3 delegated to an agent, agency's own screen would still allow 7
        // more instead of the true remaining 4).
        const delegatedRes = await pool.request()
            .input("ManpowerRequestId", sql.NVarChar(65), onboardingScreenId)
            .input("TenantID", sql.NVarChar(65), tenantId)
            .query(`
                SELECT [ManpowerRequestTradeID], SUM([AssignedQty]) AS delegated
                FROM [dbo].[MazdoorAgentTradeAssignment]
                WHERE [ManpowerRequestID] = @ManpowerRequestId AND [TenantID] = @TenantID AND [IsDeleted] = 0
                GROUP BY [ManpowerRequestTradeID]
            `);
        const delegatedByTradeId = new Map(delegatedRes.recordset.map((r) => [r.ManpowerRequestTradeID, r.delegated]));

        const trades = tradeRows.map((t) => ({
            name: t.TradeName,
            count: Math.max(0, t.Qty - (delegatedByTradeId.get(t.ID2) || 0)),
        }));

        res.status(200).json({ message: "Trades loaded successfully!", data: trades });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getOnboardingTrades

// Real header/banner info for CandidateOnboarding.jsx's "MPR Context Banner"
// (title, agency, agent, staff counts, status) — that page previously drove
// this from MANPOWER_REQUESTS/SUB_MPR_REGISTRY mock catalogs keyed by old
// demo ids ("MPR-2403"), which never matched a real ID2 GUID or SubMprCode.
// Deliberately built from plain queries against columns already proven safe
// elsewhere in this session (MazdoorManpowerRequest's List proc, the
// AgentTradeAssignment/Agency/Agent lookups already used in
// getSubMprsForRequest/getAgentSubMprs) rather than usp_Mazdoor_ManpowerRequest_Details,
// whose exact output columns haven't been confirmed.
const getOnboardingScreenInfo = async (req, res) => {
    const { onboardingScreenId } = req.body;

    try {
        const pool = await getTenantPool(req);
        const tenantId = await resolveOnboardingScreenTenantId(pool, req, onboardingScreenId);

        // Same "try Sub-MPR first" branch already proven in getOnboardingTrades.
        const subRes = await pool.request()
            .input("SubMprCode", sql.NVarChar(65), onboardingScreenId)
            .input("TenantID", sql.NVarChar(65), tenantId)
            .query(`
                SELECT TOP 1 a.[ManpowerRequestID], ag.[AgentName]
                FROM [dbo].[MazdoorAgentTradeAssignment] a
                INNER JOIN [dbo].[MazdoorAgent] ag ON ag.[ID2] = a.[AgentID]
                WHERE a.[SubMprCode] = @SubMprCode AND a.[TenantID] = @TenantID AND a.[IsDeleted] = 0
            `);
        const isSubMpr = subRes.recordset.length > 0;
        const parentMprId = isSubMpr ? subRes.recordset[0].ManpowerRequestID : onboardingScreenId;
        const agentName = isSubMpr ? subRes.recordset[0].AgentName : null;

        const mprRes = await pool.request()
            .input("Id", sql.NVarChar(65), parentMprId)
            .input("TenantID", sql.NVarChar(65), tenantId)
            .query(`
                SELECT [ReferenceNo], [Title], [StatusId], [AgencyID]
                FROM [dbo].[MazdoorManpowerRequest]
                WHERE [ID2] = @Id AND [TenantID] = @TenantID AND [IsDeleted] = 0
            `);
        const header = mprRes.recordset[0];

        let agencyName = null;
        if (header?.AgencyID) {
            const agencyRes = await pool.request()
                .input("Id", sql.NVarChar(65), header.AgencyID)
                .query(`SELECT [AgencyName] FROM [dbo].[MazdoorAgency] WHERE [ID2] = @Id`);
            agencyName = agencyRes.recordset[0]?.AgencyName || null;
        }

        const tradeRes = await pool.request()
            .input("Id", sql.NVarChar(65), parentMprId)
            .input("TenantID", sql.NVarChar(65), tenantId)
            .query(`
                SELECT ISNULL(SUM([Qty]), 0) AS StaffRequired
                FROM [dbo].[MazdoorManpowerRequestTrade]
                WHERE [ManpowerRequestID] = @Id AND [TenantID] = @TenantID AND [IsDeleted] = 0
            `);
        const deliveredRes = await pool.request()
            .input("Id", sql.NVarChar(65), parentMprId)
            .input("TenantID", sql.NVarChar(65), tenantId)
            .query(`
                SELECT ISNULL(SUM([DeliveredQty]), 0) AS StaffFulfilled
                FROM [dbo].[MazdoorAgentTradeAssignment]
                WHERE [ManpowerRequestID] = @Id AND [TenantID] = @TenantID AND [IsDeleted] = 0
            `);

        res.status(200).json({
            message: "Onboarding screen info loaded successfully!",
            data: {
                isSubMpr,
                parentMprId,
                parentReferenceNo: header?.ReferenceNo || parentMprId,
                title: header?.Title || "Untitled Request",
                status: header?.StatusId || "Draft",
                agencyName,
                agentName,
                staffRequired: tradeRes.recordset[0]?.StaffRequired || 0,
                staffFulfilled: deliveredRes.recordset[0]?.StaffFulfilled || 0,
            },
        });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getOnboardingScreenInfo

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
    getOnboardingTrades,
    getOnboardingScreenInfo,
    getOnboardingScreensList,
    onboardingScreenSaveUpdate,
};
