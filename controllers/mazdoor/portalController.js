// Public (pre-login) and portal-authenticated endpoints for the Mazdoor
// Agency/Agent self-service portal. Login and signup credential creation now
// go through the app's standard authentication process (Users table,
// User_Registeration, User_login, GetUserModulesMenus — see _shared.js's
// registerPortalUser/ensureMazdoorPortalRole) instead of a separate
// MazdoorPortalUser table/JWT.
//
// Multi-tenancy model: an Agency/Agent an admin creates directly
// (agencyController.js/agentController.js's grantAgencyPortalAccess /
// grantAgentPortalAccess) stays private to that admin's own tenant. One that
// self-registers here instead gets its OWN brand-new tenant (createPortalTenant)
// — it isn't "owned" by whichever Requester happens to look at it first, and
// can be discovered/assigned work by any Requester tenant (see the
// marketplace visibility queries in agencyController.js/agentController.js's
// *ForAssignment functions). That's also why signup no longer needs
// subdomain-based tenant resolution: it makes its own tenant instead of
// joining an existing one.
const {
    sql, jwt, bcrypt, SECRET_KEY,
    uploadDocument, filesByField, newId,
    getPortalPool, createPortalTenant, getTenantPool, registerPortalUser,
    PORTAL_DEFAULT_DATABASE, setCurrentDatabase, store,
} = require("./_shared");

async function saveAgency(pool, tenantId, organizationId, formData, email) {
    const result = await pool.request()
        .input("ID2", sql.NVarChar(65), null)
        .input("TenantID", sql.NVarChar(65), tenantId)
        .input("OrganizationID", sql.NVarChar(65), organizationId || null)
        .input("AgencyName", sql.NVarChar(200), formData.agencyName)
        .input("AgencyType", sql.NVarChar(50), formData.agencyType || null)
        .input("LicenseNumber", sql.NVarChar(100), formData.licenseNumber || formData.licenseNo)
        .input("CountryOfRegistration", sql.NVarChar(100), formData.countryOfRegistration || formData.opCountry || null)
        .input("YearEstablished", sql.NVarChar(4), formData.yearEstablished || null)
        .input("WebsiteUrl", sql.NVarChar(255), formData.websiteUrl || null)
        .input("ContactPerson", sql.NVarChar(150), formData.contactPerson)
        .input("Designation", sql.NVarChar(100), formData.designation || null)
        .input("Email", sql.NVarChar(150), email)
        .input("Phone", sql.NVarChar(30), formData.phone || formData.agencyPhone)
        .input("Whatsapp", sql.NVarChar(30), formData.whatsapp || null)
        .input("Address", sql.NVarChar(500), formData.address || null)
        .input("City", sql.NVarChar(100), formData.city || null)
        .input("State", sql.NVarChar(100), formData.state || null)
        .input("CountriesOfExpertise", sql.NVarChar(sql.MAX), formData.countriesOfExpertise || null)
        .input("TradesSpecialization", sql.NVarChar(sql.MAX), formData.tradesSpecialization || null)
        .input("MonthlyCapacity", sql.NVarChar(20), formData.monthlyCapacity || null)
        .input("Languages", sql.NVarChar(sql.MAX), formData.languages || null)
        .input("Notes", sql.NVarChar(sql.MAX), formData.notes || null)
        .input("IsPortalSignup", sql.Bit, 1)
        .input("CreatedBy", sql.NVarChar(100), email)
        .execute("dbo.usp_Mazdoor_Agency_SaveUpdate");
    return result.recordset[0].ID2;
}

async function saveAgent(pool, tenantId, organizationId, formData, email) {
    const result = await pool.request()
        .input("ID2", sql.NVarChar(65), null)
        .input("TenantID", sql.NVarChar(65), tenantId)
        .input("OrganizationID", sql.NVarChar(65), organizationId || null)
        .input("AgentName", sql.NVarChar(150), formData.agentName)
        .input("Country", sql.NVarChar(100), formData.country || formData.agentCountry || null)
        .input("Phone", sql.NVarChar(30), formData.phone || formData.agentPhone)
        .input("Email", sql.NVarChar(150), email)
        .input("Specializations", sql.NVarChar(sql.MAX), formData.specializations || null)
        .input("IsPortalSignup", sql.Bit, 1)
        .input("CreatedBy", sql.NVarChar(100), email)
        .execute("dbo.usp_Mazdoor_Agent_SaveUpdate");
    return result.recordset[0].ID2;
}

const portalSignup = async (req, res) => {
    const formData = req.body;

    try {
        if (formData.role !== "agency" && formData.role !== "agent") {
            return res.status(400).json({ message: "role must be agency or agent.", data: null });
        }
        if (!formData.password || formData.password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters.", data: null });
        }

        const pool = await getPortalPool(req);
        const email = formData.email || formData.agencyEmail || formData.agentEmail;

        const { tenantId, organizationId } = await createPortalTenant(pool, {
            tenantName: formData.role === "agency" ? formData.agencyName : formData.agentName,
            email,
            phone: formData.phone || formData.agencyPhone || formData.agentPhone,
            country: formData.countryOfRegistration || formData.opCountry || formData.country || formData.agentCountry,
            city: formData.city || formData.agentCity,
            createdBy: email,
        });

        let principalId;
        let fullName;
        if (formData.role === "agency") {
            principalId = await saveAgency(pool, tenantId, organizationId, formData, email);
            fullName = formData.contactPerson || formData.agencyName;

            const documents = filesByField(req, "documents");
            if (documents.length > 0) {
                const uploaded = await Promise.all(documents.map((f) => uploadDocument(f)));
                for (const doc of uploaded) {
                    await pool.request()
                        .input("ID2", sql.NVarChar(65), newId())
                        .input("TenantID", sql.NVarChar(65), tenantId)
                        .input("AgencyID", sql.NVarChar(65), principalId)
                        .input("FileName", sql.NVarChar(255), doc.fileName)
                        .input("FileUrl", sql.NVarChar(500), doc.fileUrl)
                        .query(`INSERT INTO [dbo].[MazdoorAgencyDocument] ([ID2],[TenantID],[AgencyID],[FileName],[FileUrl])
                                VALUES (@ID2,@TenantID,@AgencyID,@FileName,@FileUrl)`);
                }
            }
        } else {
            principalId = await saveAgent(pool, tenantId, organizationId, formData, email);
            fullName = formData.agentName;
        }

        // Login credentials via the standard Users table — see
        // registerPortalUser's comment. The MazdoorAgency/MazdoorAgent record
        // above is created either way; this is what actually lets them log in.
        await registerPortalUser(pool, {
            tenantId,
            organizationId,
            database: req.body.from || PORTAL_DEFAULT_DATABASE,
            email,
            password: formData.password,
            fullName,
            agencyId: formData.role === "agency" ? principalId : null,
            agentId: formData.role === "agent" ? principalId : null,
            createdBy: email,
        });

        res.status(200).json({
            message: "Registration submitted — pending admin approval",
            data: { id: principalId, role: formData.role },
        });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of portalSignup

const portalLogin = async (req, res) => {
    const { email, password } = req.body;

    try {
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required.", data: null });
        }

        store.dispatch(setCurrentDatabase(req.body.from || PORTAL_DEFAULT_DATABASE));
        const config = store.getState().constents.config;
        const pool = await sql.connect(config);

        // User_login resolves the tenant itself (by email, within the
        // connected database) — same as the internal app's own signIn, no
        // subdomain lookup needed.
        const result = await pool.request()
            .input("email", sql.NVarChar, email)
            .execute("User_login");

        const user = result.recordset[0];
        if (!user) {
            return res.status(400).json({ message: "Invalid email", data: null });
        }

        const isMatch = await bcrypt.compare(password, user.Password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid password", data: null });
        }

        await pool.request()
            .input("tenantId", sql.NVarChar, user.TenantId)
            .query(`EXEC sp_set_session_context @key=N'TenantId', @value=@tenantId`);

        // User_login's SELECT doesn't include AgencyId (only AgentId) — a
        // plain follow-up query rather than a proc change.
        const agencyRow = await pool.request()
            .input("Id", sql.NVarChar, user.ID2)
            .query(`SELECT [AgencyId] FROM [dbo].[Users] WHERE [ID2] = @Id`);
        const agencyId = agencyRow.recordset[0]?.AgencyId || null;
        const agentId = user.AgentId || null;

        if (!agencyId && !agentId) {
            return res.status(400).json({ message: "This account is not registered as a Mazdoor Agency/Agent.", data: null });
        }
        const principalType = agencyId ? "agency" : "agent";

        // The Organization assigned at signup/grant time (registerPortalUser
        // in _shared.js) lives in UserOrganization, not a column on Users
        // itself — same table UserApplicationRole_SaveOrUpdate_Multi wrote it
        // into. AgencyDashboard.jsx/AgentDashboard.jsx need this on the portal
        // user (they don't have the internal app's org-selection flow to fall
        // back on).
        const orgRow = await pool.request()
            .input("UserID", sql.NVarChar, user.ID2)
            .query(`SELECT TOP 1 [OrganizationID] FROM [dbo].[UserOrganization] WHERE [UserID] = @UserID`);
        const organizationId = orgRow.recordset[0]?.OrganizationID || null;

        const modules = await pool.request()
            .input("UserID", sql.NVarChar, user.ID2)
            .execute("GetUserModulesMenus");

        if (modules.recordset.length === 0) {
            return res.status(400).json({ message: "Your account isn't authorized for portal access yet. Contact your administrator.", data: null });
        }

        let principalName = null;
        if (principalType === "agency") {
            const agencyRes = await pool.request()
                .input("Id", sql.NVarChar(65), agencyId)
                .query(`SELECT [AgencyName] FROM [dbo].[MazdoorAgency] WHERE [ID2] = @Id`);
            principalName = agencyRes.recordset[0]?.AgencyName || null;
        } else {
            const agentRes = await pool.request()
                .input("Id", sql.NVarChar(65), agentId)
                .query(`SELECT [AgentName] FROM [dbo].[MazdoorAgent] WHERE [ID2] = @Id`);
            principalName = agentRes.recordset[0]?.AgentName || null;
        }

        const userDetails = {
            id: user.ID2,
            ID2: user.ID2,
            email: user.Email,
            userName: user.UserName,
            fullName: user.FullName,
            database: user.databaseName,
            tenantId: user.TenantId,
            tenantCode: user.TenantCode,
            tenantName: user.TenantName,
            principalType,
            agencyId,
            agentId,
            organizationId,
            agencyName: principalType === "agency" ? principalName : null,
            agentName: principalType === "agent" ? principalName : null,
            client: user.databaseName,
        };

        const token = jwt.sign(userDetails, SECRET_KEY, { expiresIn: "12h" });

        res.status(200).json({
            message: "Login successful",
            data: { token, user: userDetails },
        });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of portalLogin

// Portal-authenticated (standard authenticateToken, same as every other
// Mazdoor endpoint now) — reads req.authUser.agencyId/agentId, set on the
// token by portalLogin above.
const getPortalProfile = async (req, res) => {
    try {
        const pool = await getTenantPool(req);

        if (req.authUser.principalType === "agency") {
            const result = await pool.request()
                .input("Id", sql.NVarChar(65), req.authUser.agencyId)
                .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
                .execute("dbo.usp_Mazdoor_Agency_Details");

            return res.status(200).json({
                message: "Profile loaded successfully!",
                data: result.recordsets[0]?.[0] || null,
                documents: result.recordsets[1] || [],
            });
        }

        const result = await pool.request()
            .input("Id", sql.NVarChar(65), req.authUser.agentId)
            .input("TenantID", sql.NVarChar(65), req.authUser.tenantId)
            .execute("dbo.usp_Mazdoor_Agent_Details");

        res.status(200).json({ message: "Profile loaded successfully!", data: result.recordset[0] || null });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getPortalProfile

module.exports = { portalSignup, portalLogin, getPortalProfile };
