// Barber self-view on the global URL /salon-barber — mobile number + 4-digit PIN.
// No tenant in the URL: the barber's own SalonStaff record supplies tenant,
// organization and branch. See README "Barber login" in Frontend/sql/Salon.
const { sql, bcrypt, handle, ok, rows, num, getSalonPool, signBarberToken, shopNow, HttpError } = require("./_shared");
const map = require("./_mappers");

// POST /api/salon-barber/login  { phone, pin, staffId? }
//   200 { token, barber }                       — logged in
//   200 { choose: [{ staffId, salonName, branchName }] } — same phone + PIN at 2+ salons; resend with staffId
//   401 { attemptsLeft }                         — wrong phone or PIN
//   429 { lockSecondsLeft }                      — 5 wrong PINs: locked 15 min
const barberLogin = async (req, res) => {
    try {
        const phone = String(req.body.phone || "").trim();
        const pin = String(req.body.pin || "").trim();
        if (!phone || !/^\d{4}$/.test(pin)) throw new HttpError(400, "Enter your mobile number and 4-digit PIN.");

        const pool = await getSalonPool();
        const found = await pool.request().input("Phone", sql.NVarChar(30), phone).execute("dbo.usp_Salon_BarberLogin_Candidates");
        const lock = found.recordsets[0][0];
        if (lock && num(lock.LockSecondsLeft) > 0) {
            return res.status(429).json({ message: "Too many tries.", data: { lockSecondsLeft: num(lock.LockSecondsLeft) } });
        }

        // bcrypt-check the PIN against every barber record with this phone (usually 1, rarely 2-3).
        const candidates = found.recordsets[1] || [];
        const matches = [];
        for (const c of candidates) {
            if (c.PinHash && (await bcrypt.compare(pin, c.PinHash))) matches.push(c);
        }

        const attempt = await pool.request()
            .input("Phone", sql.NVarChar(30), phone)
            .input("Success", sql.Bit, matches.length ? 1 : 0)
            .execute("dbo.usp_Salon_BarberLogin_RecordAttempt");

        if (!matches.length) {
            const a = attempt.recordset[0] || {};
            if (num(a.LockSecondsLeft) > 0) {
                return res.status(429).json({ message: "Too many tries.", data: { lockSecondsLeft: num(a.LockSecondsLeft) } });
            }
            return res.status(401).json({ message: "Wrong mobile number or PIN.", data: { attemptsLeft: num(a.AttemptsLeft) } });
        }

        const chosen = matches.length === 1 ? matches[0] : matches.find((m) => m.StaffID === req.body.staffId);
        if (!chosen) {
            return ok(res, {
                choose: matches.map((m) => ({ staffId: m.StaffID, salonName: m.SalonName || "", branchName: m.BranchName || "" })),
            }, "Choose your salon");
        }

        const token = signBarberToken({
            tenantId: chosen.TenantID,
            organizationId: chosen.OrganizationID || "",
            branchId: chosen.BranchId || "",
            staffId: chosen.StaffID,
        });
        return ok(res, {
            token,
            barber: { staffId: chosen.StaffID, name: chosen.StaffName, tone: num(chosen.AvatarTone), salonName: chosen.SalonName || "", branchName: chosen.BranchName || "" },
        }, "Login successful");
    } catch (error) {
        return res.status(error.status || 400).json({ message: error.message, data: null });
    }
};

// POST /api/salon-barber/home  (barber token) — only the token's own staffId, never from the body
const barberHome = handle(async (req, res) => {
    const { tenantId, staffId } = req.barber;
    const { today, monthKey } = shopNow();
    const pool = await getSalonPool();
    const r = await pool.request()
        .input("TenantID", sql.NVarChar(65), tenantId)
        .input("StaffID", sql.NVarChar(65), staffId)
        .input("Today", sql.Date, today)
        .execute("dbo.usp_Salon_Barber_Home");

    const [month, jobs, adjustments, history] = r.recordsets.map(rows);
    const m = month[0];
    if (!m) throw new HttpError(404, "Barber not found.");

    const settings = await pool.request()
        .input("TenantID", sql.NVarChar(65), tenantId)
        .input("OrganizationID", sql.NVarChar(65), req.barber.organizationId || "")
        .input("BranchId", sql.NVarChar(65), req.barber.branchId || "")
        .execute("dbo.usp_Salon_Settings_Get");
    const s = rows(settings.recordset)[0];

    ok(res, {
        today,
        monthKey,
        salonName: s?.SalonName || "",
        branchName: s?.BranchName || "",
        me: {
            id: m.StaffID,
            name: m.StaffName,
            tone: num(m.AvatarTone),
            monthlyTarget: num(m.MonthlyTarget),
            ruleName: m.RuleName || "",
            ruleType: m.RuleType || "",
        },
        month: map.payoutFigures(m),
        todayJobs: jobs.map((j) => ({
            id: j.ID2, billNo: j.BillNo, at: j.BillAt, items: j.Items || "",
            commission: num(j.CommissionTotal), tip: num(j.Tip), earned: num(j.Earned),
        })),
        adjustments: adjustments.map((a) => ({ id: a.ID2, type: a.AdjType, amount: num(a.Amount), date: a.AdjDate, note: a.Note || "" })),
        history: history.map((h) => ({ ...map.payoutFigures({ ...h, StaffID: staffId }), isPaid: !!h.IsPaid, method: h.PayMethod || null, paidAt: h.PaidAt || null })),
    });
});

module.exports = { barberLogin, barberHome };
