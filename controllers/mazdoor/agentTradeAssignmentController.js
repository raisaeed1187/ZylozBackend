const { sql, getTenantPool, resolveManpowerRequestTenantId } = require("./_shared");

function toDateStr(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

// usp_Mazdoor_SubMpr_AcceptDecline's exact StatusId vocabulary isn't
// documented — defensively normalize to what AgentDashboard.jsx's
// STATUS_CONFIG actually recognizes (same defensive-mapping approach as
// AgencyDashboard.jsx's deriveAgencyStatus, for the same reason: the DB
// default is 'Pending', and anything not explicitly Accepted/Declined should
// read as still-pending rather than falling through unstyled).
function deriveSubMprStatus(statusId) {
    if (statusId === "Declined") return "Declined";
    if (statusId === "Accepted") return "Accepted";
    return "Pending";
}

const agentTradeAssignmentSaveUpdate = async (req, res) => {
    const formData = req.body;

    try {
        const pool = await getTenantPool(req);
        // See resolveManpowerRequestTenantId in _shared.js — an Agency portal
        // caller assigning agents on a request submitted to it usually has a
        // different tenant than the Requester who owns the MPR.
        const tenantId = await resolveManpowerRequestTenantId(pool, req, formData.manpowerRequestId);
        const result = await pool.request()
            .input("ManpowerRequestId", sql.NVarChar(65), formData.manpowerRequestId)
            .input("TenantID", sql.NVarChar(65), tenantId)
            .input("OrganizationID", sql.NVarChar(65), formData.organizationId || null)
            .input("Assignments", sql.NVarChar(sql.MAX), formData.assignments)
            .input("CreatedBy", sql.NVarChar(100), req.authUser.username)
            .execute("dbo.usp_Mazdoor_AgentTradeAssignment_SaveUpdate");

        res.status(200).json({ message: result.recordset[0].Message, data: result.recordset[0] });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of agentTradeAssignmentSaveUpdate

const getMazdoorAgentTradeAssignments = async (req, res) => {
    const { manpowerRequestId } = req.body;

    try {
        const pool = await getTenantPool(req);
        const tenantId = await resolveManpowerRequestTenantId(pool, req, manpowerRequestId);
        const result = await pool.request()
            .input("ManpowerRequestId", sql.NVarChar(65), manpowerRequestId)
            .input("TenantID", sql.NVarChar(65), tenantId)
            .execute("dbo.usp_Mazdoor_AgentTradeAssignment_List");

        res.status(200).json({ message: "Agent trade assignments loaded successfully!", data: result.recordset });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getMazdoorAgentTradeAssignments

const deleteAgentTradeAssignment = async (req, res) => {
    const { agentId, requirementId } = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("AgentId", sql.NVarChar(65), agentId)
            .input("RequirementId", sql.NVarChar(65), requirementId)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .execute("dbo.usp_Mazdoor_AgentTradeAssignment_Delete");

        res.status(200).json({ message: result.recordset[0].Message, data: result.recordset[0] });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of deleteAgentTradeAssignment

const subMprGenerate = async (req, res) => {
    const { manpowerRequestId } = req.body;

    try {
        const pool = await getTenantPool(req);
        const tenantId = await resolveManpowerRequestTenantId(pool, req, manpowerRequestId);
        const result = await pool.request()
            .input("ManpowerRequestId", sql.NVarChar(65), manpowerRequestId)
            .input("TenantID", sql.NVarChar(65), tenantId)
            .execute("dbo.usp_Mazdoor_SubMprGenerate");

        res.status(200).json({ message: "Sub-MPR codes generated successfully!", data: result.recordset });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of subMprGenerate

// Agent-side accept/decline of an assigned Sub-MPR — reached from the
// self-service portal. Runs under the standard authenticateToken now (the
// portal login issues the same kind of token as internal staff — see
// portalController.js), so the ownership check below (does this caller's own
// agentId match the Sub-MPR's assigned agent) matters: nothing in
// usp_Mazdoor_SubMpr_AcceptDecline itself verifies that on its own.
const subMprAcceptDecline = async (req, res) => {
    const { subMprCode, decision, comment } = req.body;

    try {
        if (!req.authUser.agentId) {
            return res.status(403).json({ message: "Only an Agent portal account can decide on a Sub-MPR.", data: null });
        }

        const pool = await getTenantPool(req);

        // The Sub-MPR/assignment belongs to the REQUESTER's tenant, which
        // usually isn't this agent's own tenant (a self-registered agent has
        // its own — see createPortalTenant in _shared.js) — so ownership is
        // verified by AgentID match alone, and the assignment's own TenantID
        // is what gets passed to the decision proc below, not req.authUser.tenantId.
        const owner = await pool.request()
            .input("SubMprCode", sql.NVarChar(30), subMprCode)
            .query(`SELECT TOP 1 [AgentID], [TenantID] FROM [dbo].[MazdoorAgentTradeAssignment] WHERE [SubMprCode] = @SubMprCode AND [IsDeleted] = 0`);
        const assignment = owner.recordset[0];
        if (!assignment || assignment.AgentID !== req.authUser.agentId) {
            return res.status(403).json({ message: "This Sub-MPR isn't assigned to you.", data: null });
        }

        const result = await pool.request()
            .input("SubMprCode", sql.NVarChar(30), subMprCode)
            .input("TenantID", sql.NVarChar(65), assignment.TenantID)
            .input("Decision", sql.NVarChar(10), decision)
            .input("Comment", sql.NVarChar(500), comment || null)
            .execute("dbo.usp_Mazdoor_SubMpr_AcceptDecline");

        res.status(200).json({ message: result.recordset[0].Message, data: result.recordset[0] });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of subMprAcceptDecline

// Real "my assigned Sub-MPRs" list for AgentDashboard.jsx (replaces the
// AGENT_SUB_MPRS mock array). A Sub-MPR groups every MazdoorAgentTradeAssignment
// row sharing the same SubMprCode (one code per agent per MPR, written by
// usp_Mazdoor_SubMprGenerate across every trade assigned to that agent within
// that MPR — see AgencyRequestDetail.jsx's handleSave -> subMprGenerate flow).
// Cross-tenant by construction: filtering by AgentID alone (not TenantID) is
// what makes this show assignments from ANY Requester tenant, since a
// self-registered agent has its own separate tenant (see createPortalTenant
// in _shared.js) — same reasoning as getManpowerRequestsForAgency.
const getAgentSubMprs = async (req, res) => {
    try {
        if (!req.authUser.agentId) {
            return res.status(403).json({ message: "Only an Agent portal account can view this.", data: null });
        }

        const pool = await getTenantPool(req);

        const rowsRes = await pool.request()
            .input("AgentID", sql.NVarChar(65), req.authUser.agentId)
            .query(`
                SELECT
                    a.[TenantID], a.[ManpowerRequestID], a.[SubMprCode], a.[StatusId],
                    a.[AssignedQty], a.[AcceptComment], a.[DeclineComment], a.[TargetDate],
                    t.[TradeName]
                FROM [dbo].[MazdoorAgentTradeAssignment] a
                INNER JOIN [dbo].[MazdoorManpowerRequestTrade] t ON t.[ID2] = a.[ManpowerRequestTradeID]
                WHERE a.[AgentID] = @AgentID AND a.[IsDeleted] = 0 AND a.[SubMprCode] IS NOT NULL
                ORDER BY a.[CreatedAt]
            `);

        // Group trade rows into one Sub-MPR per SubMprCode.
        const bySubMpr = new Map();
        for (const row of rowsRes.recordset) {
            if (!bySubMpr.has(row.SubMprCode)) {
                // console.log(row);
                bySubMpr.set(row.SubMprCode, {
                    tenantId: row.TenantID,
                    manpowerRequestId: row.ManpowerRequestID,
                    status: row.StatusId,
                    acceptComment: row.AcceptComment || undefined,
                    declineComment: row.DeclineComment || undefined,
                    date: toDateStr(row.TargetDate),
                    trades: [],
                    staffRequired: 0,
                });
            }
            const entry = bySubMpr.get(row.SubMprCode);
            entry.trades.push({ name: row.TradeName, count: row.AssignedQty });
            entry.staffRequired += row.AssignedQty;
        }

        // Resolve each distinct parent MPR's title/destination/agency once
        // (usp_Mazdoor_ManpowerRequest_Details is already proven safe/correct —
        // reused here rather than re-deriving its column mapping by hand).
        const mprCache = new Map();
        const subMprs = [];
        for (const [subMprCode, entry] of bySubMpr) {
            // console.log(entry);
            const cacheKey = `${entry.tenantId}:${entry.manpowerRequestId}`;
            if (!mprCache.has(cacheKey)) {
                const headerRes = await pool.request()
                    .input("Id", sql.NVarChar(65), entry.manpowerRequestId)
                    .input("TenantID", sql.NVarChar(65), entry.tenantId)
                    .execute("dbo.usp_Mazdoor_ManpowerRequest_Details");
                const header = headerRes.recordsets[0]?.[0];

                let agencyName = "-";
                if (header?.AgencyID) {
                    const agencyRes = await pool.request()
                        .input("Id", sql.NVarChar(65), header.AgencyID)
                        .query(`SELECT [AgencyName] FROM [dbo].[MazdoorAgency] WHERE [ID2] = @Id`);
                    agencyName = agencyRes.recordset[0]?.AgencyName || "-";
                }

                const mprRes = await pool.request()
                    .input("Id", sql.NVarChar(65), entry.manpowerRequestId)
                    .input("TenantID", sql.NVarChar(65), entry.tenantId)
                    .query(`SELECT [ReferenceNo] FROM [dbo].[MazdoorManpowerRequest] WHERE [ID2] = @Id AND [TenantID] = @TenantID AND [IsDeleted] = 0`);

                mprCache.set(cacheKey, {
                    parentMPR: header?.ID2 || entry.manpowerRequestId,
                    parentMPRCode: mprRes.recordset[0]?.ReferenceNo || header?.ID2 || entry.manpowerRequestId,
                    title: header?.Title || "Untitled Request",
                    destination: header?.Destination || "-",
                    joiningDate: toDateStr(header?.TargetJoiningDate),
                    agency: agencyName,
                });
            }
            const mprInfo = mprCache.get(cacheKey);

            // AgentDashboard.jsx needs to know up front whether this Sub-MPR
            // already has an interview schedule (to show "View Schedule" vs
            // "Schedule") — usp_Mazdoor_InterviewSchedule_Details is already
            // the proven-correct way to look one up (see interviewScheduleController.js).
            const scheduleRes = await pool.request()
                .input("SubMprCode", sql.NVarChar(30), subMprCode)
                .input("TenantID", sql.NVarChar(65), entry.tenantId)
                .execute("dbo.usp_Mazdoor_InterviewSchedule_Details");
            const hasSchedule = !!scheduleRes.recordsets[0]?.[0];

            subMprs.push({
                id: subMprCode,
                title: mprInfo.title,
                agency: mprInfo.agency,
                destination: mprInfo.destination,
                trades: entry.trades,
                staffRequired: entry.staffRequired,
                date: entry.date || mprInfo.joiningDate || "-",
                status: deriveSubMprStatus(entry.status),
                parentMPR: mprInfo.parentMPR,
                parentMPRCode: mprInfo.parentMPRCode,
                hasSchedule,
                acceptComment: entry.acceptComment,
                declineComment: entry.declineComment,
            });
        }

        res.status(200).json({ message: "Sub-MPRs loaded successfully!", data: subMprs });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getAgentSubMprs

// Every Sub-MPR generated under one Main MPR, for the internal admin
// (Requester) side — CandidateOnboardingList.jsx's Sub-MPR rows were driven
// by a MOCK_SUB_MPRS object keyed by old demo ids, so a real MPR's Sub-MPRs
// (and the candidates an agent added under them — a different
// onboardingScreenId than the main MPR's own) were never reachable from the
// Requester's own login. Reuses usp_Mazdoor_AgentTradeAssignment_List
// (already proven correct — same proc getMazdoorAgentTradeAssignments calls)
// and groups its flat trade/agent rows by SubMprCode, same aggregation as
// getAgentSubMprs above but across every agent on this one MPR rather than
// one agent across every MPR.
const getSubMprsForRequest = async (req, res) => {
    const { manpowerRequestId } = req.body;

    try {
        const pool = await getTenantPool(req);
        const tenantId = await resolveManpowerRequestTenantId(pool, req, manpowerRequestId);
        const result = await pool.request()
            .input("ManpowerRequestId", sql.NVarChar(65), manpowerRequestId)
            .input("TenantID", sql.NVarChar(65), tenantId)
            .execute("dbo.usp_Mazdoor_AgentTradeAssignment_List");

        const bySubMpr = new Map();
        for (const row of result.recordset) {
            if (!row.SubMprCode) continue;
            if (!bySubMpr.has(row.SubMprCode)) {
                bySubMpr.set(row.SubMprCode, {
                    id: row.SubMprCode,
                    agentId: row.AgentID,
                    agentName: row.AgentName,
                    status: row.StatusId,
                    trades: [],
                    qty: 0,
                });
            }
            const entry = bySubMpr.get(row.SubMprCode);
            entry.trades.push(row.TradeName);
            entry.qty += row.AssignedQty;
        }

        // AgencyDashboard.jsx needs to know up front whether each Sub-MPR
        // already has an interview schedule (same reasoning/pattern as
        // getAgentSubMprs above).
        const subMprs = [];
        for (const entry of bySubMpr.values()) {
            const scheduleRes = await pool.request()
                .input("SubMprCode", sql.NVarChar(30), entry.id)
                .input("TenantID", sql.NVarChar(65), tenantId)
                .execute("dbo.usp_Mazdoor_InterviewSchedule_Details");
            subMprs.push({ ...entry, hasSchedule: !!scheduleRes.recordsets[0]?.[0] });
        }

        res.status(200).json({ message: "Sub-MPRs loaded successfully!", data: subMprs });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getSubMprsForRequest

module.exports = {
    agentTradeAssignmentSaveUpdate,
    getMazdoorAgentTradeAssignments,
    deleteAgentTradeAssignment,
    subMprGenerate,
    subMprAcceptDecline,
    getAgentSubMprs,
    getSubMprsForRequest,
};
