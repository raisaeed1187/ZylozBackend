const { sql, getTenantPool } = require("./_shared");

// AgentsList.jsx / AgentCreation.jsx read camelCase fields (and, on the list
// screen specifically, `name` rather than `agentName`) but the stored procs
// return the MazdoorAgent columns as-is — same mismatch already fixed for
// agencies/manpower requests/candidates.
function toListRow(row) {
    return {
        ...row,
        id: row.ID2,
        name: row.AgentName || "",
        country: row.Country || "",
        phone: row.Phone || "",
        email: row.Email || "",
        specializations: row.Specializations,
        statusId: row.StatusId || "",
        createdAt: row.CreatedAt,
    };
}

function toDetailsRow(row) {
    if (!row) return null;
    return {
        ...row,
        id: row.ID2,
        agentName: row.AgentName || "",
        country: row.Country || "",
        phone: row.Phone || "",
        email: row.Email || "",
        specializations: row.Specializations,
        statusId: row.StatusId || "",
        organizationId: row.OrganizationID || "",
    };
}

const agentSaveUpdate = async (req, res) => {
    const formData = req.body;

    try {
        const pool = await getTenantPool(req);

        const result = await pool.request()
            .input("ID2", sql.NVarChar(65), formData.ID2 || null)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .input("OrganizationID", sql.NVarChar(65), formData.organizationId || null)
            .input("AgentName", sql.NVarChar(150), formData.agentName)
            .input("Country", sql.NVarChar(100), formData.country || formData.agentCountry || null)
            .input("Phone", sql.NVarChar(30), formData.phone || formData.agentPhone)
            .input("Email", sql.NVarChar(150), formData.email || formData.agentEmail)
            .input("Specializations", sql.NVarChar(sql.MAX), formData.specializations || null)
            .input("IsPortalSignup", sql.Bit, 0)
            .input("CreatedBy", sql.NVarChar(100), req.authUser.username)
            .execute("dbo.usp_Mazdoor_Agent_SaveUpdate");

        res.status(200).json({ message: result.recordset[0].Message, data: result.recordset[0] });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of agentSaveUpdate

const getAgentsList = async (req, res) => {
    const { organizationId } = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .input("OrganizationID", sql.NVarChar(65), organizationId || null)
            .execute("dbo.usp_Mazdoor_Agent_List");

        res.status(200).json({ message: "Agents list loaded successfully!", data: result.recordset.map(toListRow) });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getAgentsList

const getAgentDetails = async (req, res) => {
    const { Id } = req.body;

    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("Id", sql.NVarChar(65), Id)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .execute("dbo.usp_Mazdoor_Agent_Details");

        res.status(200).json({ message: "Agent details loaded successfully!", data: result.recordset.map(toDetailsRow) });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getAgentDetails

module.exports = { agentSaveUpdate, getAgentsList, getAgentDetails };
