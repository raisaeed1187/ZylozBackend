const { sql, getTenantPool, registerPortalUser } = require("./_shared");

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

// Marketplace visibility for the "Assign Agents" picker (AgencyRequestDetail.jsx)
// — mirrors getAgenciesForAssignment in agencyController.js. Called from an
// Agency's own portal session (req.authUser.tenantId = that agency's tenant),
// it surfaces both that tenant's own agents AND self-registered agents from
// any other tenant (each identified the same way: a Users login whose
// AgentId/TenantId point back at itself).
const getAgentsForAssignment = async (req, res) => {
    try {
        const pool = await getTenantPool(req);
        const result = await pool.request()
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .query(`SELECT [ID2],[AgentName],[Country],[Phone],[Email],[Specializations],[StatusId],[CreatedAt]
                    FROM [dbo].[MazdoorAgent] ma
                    WHERE ma.[IsDeleted] = 0 AND ma.[StatusId] = 'Active'
                      AND (
                            ma.[TenantID] = @TenantID
                            OR EXISTS (SELECT 1 FROM [dbo].[Users] u WHERE u.[AgentId] = ma.[ID2] AND u.[TenantId] = ma.[TenantID])
                          )
                    ORDER BY ma.[AgentName]`);

        res.status(200).json({ message: "Agents list loaded successfully!", data: result.recordset.map(toListRow) });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getAgentsForAssignment

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
        // Portal login is now a standard Users-table row (see
        // registerPortalUser in _shared.js), so this reads Users instead of
        // the retired MazdoorPortalUser table.
        const portalUser = await pool.request()
            .input("AgentID", sql.NVarChar(65), Id)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .query(`SELECT TOP 1 [ID2], [Email], [IsActive]
                    FROM [dbo].[Users]
                    WHERE [AgentId] = @AgentID AND [TenantId] = @TenantID`);
        const portalUserRow = portalUser.recordset[0];

        res.status(200).json({
            message: "Agent details loaded successfully!",
            data: result.recordset.map(toDetailsRow),
            portalAccess: portalUserRow
                ? { Email: portalUserRow.Email, Status: portalUserRow.IsActive ? "Active" : "Suspended" }
                : null,
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

        // Same reasoning as grantAgencyPortalAccess: an admin-created agent
        // already has an OrganizationID set by agentSaveUpdate — carry it
        // over to the new login's UserOrganization row.
        const agentRow = await pool.request()
            .input("Id", sql.NVarChar(65), agentId)
            .query(`SELECT [OrganizationID] FROM [dbo].[MazdoorAgent] WHERE [ID2] = @Id`);
        const organizationId = agentRow.recordset[0]?.OrganizationID || null;

        await registerPortalUser(pool, {
            tenantId: req.authUser.tenantId,
            organizationId,
            database: req.authUser.database,
            email,
            password,
            agentId,
            createdBy: req.authUser.username,
        });

        res.status(200).json({ message: "Portal access granted successfully!", data: { agentId, email } });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of grantAgentPortalAccess

module.exports = { agentSaveUpdate, getAgentsList, getAgentDetails, grantAgentPortalAccess, getAgentsForAssignment };
