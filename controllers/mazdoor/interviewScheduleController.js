const { sql, getTenantPool } = require("./_shared");

const interviewScheduleSaveUpdate = async (req, res) => {
    const { subMprCode, notes, slots } = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("SubMprCode", sql.NVarChar(30), subMprCode)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
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
        const result = await pool.request()
            .input("SubMprCode", sql.NVarChar(30), subMprCode)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
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
