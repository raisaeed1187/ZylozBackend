const { sql, getTenantPool, getPortalAuthedPool } = require("./_shared");

const agentTradeAssignmentSaveUpdate = async (req, res) => {
    const formData = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("ManpowerRequestId", sql.NVarChar(65), formData.manpowerRequestId)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
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
        const result = await pool.request()
            .input("ManpowerRequestId", sql.NVarChar(65), manpowerRequestId)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
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
        const result = await pool.request()
            .input("ManpowerRequestId", sql.NVarChar(65), manpowerRequestId)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .execute("dbo.usp_Mazdoor_SubMprGenerate");

        res.status(200).json({ message: "Sub-MPR codes generated successfully!", data: result.recordset });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of subMprGenerate

// Agent-side accept/decline of an assigned Sub-MPR — reached from the
// self-service portal, so it runs under the portal JWT, not internal auth.
const subMprAcceptDecline = async (req, res) => {
    const { subMprCode, decision, comment } = req.body;

    try {
        const pool = await getPortalAuthedPool(req);
        const result = await pool.request()
            .input("SubMprCode", sql.NVarChar(30), subMprCode)
            .input("TenantID", sql.NVarChar(65), req.portalUser.tenantId)
            .input("Decision", sql.NVarChar(10), decision)
            .input("Comment", sql.NVarChar(500), comment || null)
            .execute("dbo.usp_Mazdoor_SubMpr_AcceptDecline");

        res.status(200).json({ message: result.recordset[0].Message, data: result.recordset[0] });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of subMprAcceptDecline

module.exports = {
    agentTradeAssignmentSaveUpdate,
    getMazdoorAgentTradeAssignments,
    deleteAgentTradeAssignment,
    subMprGenerate,
    subMprAcceptDecline,
};
