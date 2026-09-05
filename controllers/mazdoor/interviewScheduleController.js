const { sql, getTenantPool, resolveOnboardingScreenTenantId } = require("./_shared");

// Interview scheduling is always reached from AgentDashboard.jsx, keyed by a
// SubMprCode — an Agent's own tenant usually isn't the Requester's tenant the
// Sub-MPR actually lives under (a self-registered agent has its own — see
// createPortalTenant in _shared.js), so req.authUser.tenantId alone silently
// scoped both the save and the read-back to the wrong tenant. Reuses
// resolveOnboardingScreenTenantId's SubMprCode-ownership branch (candidate
// onboarding screens follow the identical Sub-MPR/Agent ownership model).
const interviewScheduleSaveUpdate = async (req, res) => {
    const { subMprCode, notes, slots } = req.body;

    try {
        const pool = await getTenantPool(req);
        const tenantId = await resolveOnboardingScreenTenantId(pool, req, subMprCode);
        const result = await pool.request()
            .input("SubMprCode", sql.NVarChar(30), subMprCode)
            .input("TenantID", sql.NVarChar(65), tenantId)
            .input("Notes", sql.NVarChar(sql.MAX), notes || null)
            .input("Slots", sql.NVarChar(sql.MAX), slots || null)
            .input("CreatedBy", sql.NVarChar(100), req.authUser.username)
            .execute("dbo.usp_Mazdoor_InterviewSchedule_SaveUpdate");

        res.status(200).json({ message: result.recordset[0].Message, data: result.recordset[0] });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of interviewScheduleSaveUpdate

const getInterviewSchedule = async (req, res) => {
    const { subMprCode } = req.body;

    try {
        const pool = await getTenantPool(req);
        const tenantId = await resolveOnboardingScreenTenantId(pool, req, subMprCode);
        const result = await pool.request()
            .input("SubMprCode", sql.NVarChar(30), subMprCode)
            .input("TenantID", sql.NVarChar(65), tenantId)
            .execute("dbo.usp_Mazdoor_InterviewSchedule_Details");

        const header = result.recordsets[0]?.[0] || null;
        const slotRows = result.recordsets[1] || [];
        const interviewerRows = result.recordsets[2] || [];

        const slots = slotRows.map((s) => ({
            ...s,
            interviewers: interviewerRows.filter((iv) => iv.SlotID === s.ID2),
        }));

        res.status(200).json({
            message: "Interview schedule loaded successfully!",
            data: { ...header, slots, notes: header?.Notes || "" },
        });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getInterviewSchedule

module.exports = { interviewScheduleSaveUpdate, getInterviewSchedule };
