// Public (pre-login) and portal-authenticated endpoints for the Mazdoor
// Agency/Agent self-service portal. Signup/login have no internal JWT to
// resolve a tenant from, so they use getPortalTenant()'s subdomain lookup —
// the same mechanism sendOTP()'s VendorVerification flow uses elsewhere in
// this app for anonymous, multi-tenant requests.
const {
    sql, jwt, bcrypt, SECRET_KEY,
    uploadDocument, filesByField, newId,
    getPortalTenant, getPortalTenantByEmail, getPortalAuthedPool,
} = require("./_shared");

async function saveAgency(pool, tenantId, formData, email) {
    const result = await pool.request()
        .input("ID2", sql.NVarChar(65), null)
        .input("TenantID", sql.NVarChar(65), tenantId)
        .input("OrganizationID", sql.NVarChar(65), formData.organizationId || null)
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

async function saveAgent(pool, tenantId, formData, email) {
    const result = await pool.request()
        .input("ID2", sql.NVarChar(65), null)
        .input("TenantID", sql.NVarChar(65), tenantId)
        .input("OrganizationID", sql.NVarChar(65), formData.organizationId || null)
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

        const { pool, tenantId } = await getPortalTenant(req);
        const email = formData.email || formData.agencyEmail || formData.agentEmail;

        let principalId;
        if (formData.role === "agency") {
            principalId = await saveAgency(pool, tenantId, formData, email);

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
            principalId = await saveAgent(pool, tenantId, formData, email);
        }

        // Login credentials are only created once a password is supplied — the
        // Agency/Agent master record above is created either way (see
        // usp_Mazdoor_Portal_Signup's header comment on the two-call flow).
        if (formData.password) {
            const passwordHash = await bcrypt.hash(formData.password, 10);
            await pool.request()
                .input("TenantID", sql.NVarChar(65), tenantId)
                .input("PrincipalType", sql.NVarChar(10), formData.role)
                .input("AgencyID", sql.NVarChar(65), formData.role === "agency" ? principalId : null)
                .input("AgentID", sql.NVarChar(65), formData.role === "agent" ? principalId : null)
                .input("Email", sql.NVarChar(150), email)
                .input("PasswordHash", sql.NVarChar(255), passwordHash)
                .execute("dbo.usp_Mazdoor_Portal_Signup");
        }

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
        // Resolved from the existing MazdoorPortalUser row by email, not the
        // request's subdomain — see getPortalTenantByEmail's comment.
        const { pool, tenantId } = await getPortalTenantByEmail(req, email);

        const result = await pool.request()
            .input("TenantID", sql.NVarChar(65), tenantId)
            .input("Email", sql.NVarChar(150), email)
            .execute("dbo.usp_Mazdoor_Portal_Login");

        const user = result.recordset[0];
        if (!user) {
            return res.status(400).json({ message: "No account found with this email.", data: null });
        }

        const isMatch = await bcrypt.compare(password || "", user.PasswordHash);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid email or password.", data: null });
        }

        const userDetails = {
            id: user.ID2,
            principalType: user.PrincipalType,
            email: user.Email,
            agencyId: user.AgencyID || null,
            agencyName: user.AgencyName || null,
            agentId: user.AgentID || null,
            agentName: user.AgentName || null,
            tenantId,
            database: req.body.from || "Allbiz",
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

const getPortalProfile = async (req, res) => {
    try {
        const pool = await getPortalAuthedPool(req);

        if (req.portalUser.principalType === "agency") {
            const result = await pool.request()
                .input("Id", sql.NVarChar(65), req.portalUser.agencyId)
                .input("TenantID", sql.NVarChar(65), req.portalUser.tenantId)
                .execute("dbo.usp_Mazdoor_Agency_Details");

            return res.status(200).json({
                message: "Profile loaded successfully!",
                data: result.recordsets[0]?.[0] || null,
                documents: result.recordsets[1] || [],
            });
        }

        const result = await pool.request()
            .input("Id", sql.NVarChar(65), req.portalUser.agentId)
            .input("TenantID", sql.NVarChar(65), req.portalUser.tenantId)
            .execute("dbo.usp_Mazdoor_Agent_Details");

        res.status(200).json({ message: "Profile loaded successfully!", data: result.recordset[0] || null });
    } catch (error) {
        return res.status(400).json({ message: error.message, data: null });
    }
};
// end of getPortalProfile

module.exports = { portalSignup, portalLogin, getPortalProfile };
