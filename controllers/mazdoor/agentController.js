const { sql, bcrypt, getTenantPool } = require("./_shared");

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

        // Same plain lookup as getAgencyDetails — no proc covers this, and it
        // lets AgentCreation.jsx show whether this agent already has a portal
        // login instead of the admin finding out only when Grant fails.
        const portalUser = await pool.request()
            .input("AgentID", sql.NVarChar(65), Id)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .query(`SELECT TOP 1 [ID2], [Email], [Status], [LastLoginAt]
                    FROM [dbo].[MazdoorPortalUser]
                    WHERE [AgentID] = @AgentID AND [TenantID] = @TenantID AND [IsDeleted] = 0`);

        res.status(200).json({
            message: "Agent details loaded successfully!",
            data: result.recordset.map(toDetailsRow),
            portalAccess: portalUser.recordset[0] || null,
        });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getAgentDetails

// Mirrors grantAgencyPortalAccess in agencyController.js — same gap, same
// fix, for agents created directly via AgentCreation.jsx instead of via
// portal self-registration.
const grantAgentPortalAccess = async (req, res) => {
    const { agentId, email, password } = req.body;

    try {
        if (!password || password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters.", data: null });
        }

        const pool = await getTenantPool(req);
        const passwordHash = await bcrypt.hash(password, 10);

        await pool.request()
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .input("PrincipalType", sql.NVarChar(10), "agent")
            .input("AgentID", sql.NVarChar(65), agentId)
            .input("Email", sql.NVarChar(150), email)
            .input("PasswordHash", sql.NVarChar(255), passwordHash)
            .execute("dbo.usp_Mazdoor_Portal_Signup");

        // See the identical note in grantAgencyPortalAccess: the proc always
        // inserts Status='Pending'; the admin granting access here has
        // already effectively approved it, so activate immediately.
        await pool.request()
            .input("Email", sql.NVarChar(150), email)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .query(`UPDATE [dbo].[MazdoorPortalUser] SET [Status] = 'Active'
                    WHERE [Email] = @Email AND [TenantID] = @TenantID AND [IsDeleted] = 0`);

        res.status(200).json({ message: "Portal access granted successfully!", data: { agentId, email } });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of grantAgentPortalAccess

module.exports = { agentSaveUpdate, getAgentsList, getAgentDetails, grantAgentPortalAccess };
