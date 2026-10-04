const { sql, salonContext, scoped, handle, ok, rows, shiftMonth, isMonthKey, HttpError } = require("./_shared");
const map = require("./_mappers");

const monthStart = (mk) => `${mk}-01`;
const monthEnd = (mk) => {
    const [y, m] = mk.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return `${mk}-${String(last).padStart(2, "0")}`;
};

// Everything for one month, used by /state (current + previous) and /month (older months).
async function loadMonth(ctx, monthKey, { withPayouts }) {
    const to = monthKey === ctx.monthKey ? ctx.today : monthEnd(monthKey);
    const [bills, adjustments, expenses, closings, payouts] = await Promise.all([
        scoped(ctx).input("FromDate", sql.Date, monthStart(monthKey)).input("ToDate", sql.Date, to).execute("dbo.usp_Salon_Bill_List"),
        scoped(ctx).input("MonthKey", sql.Char(7), monthKey).execute("dbo.usp_Salon_Adjustment_List"),
        scoped(ctx).input("MonthKey", sql.Char(7), monthKey).execute("dbo.usp_Salon_Expense_List"),
        scoped(ctx).input("FromDate", sql.Date, monthStart(monthKey)).input("ToDate", sql.Date, to).execute("dbo.usp_Salon_DayClosing_List"),
        withPayouts
            ? scoped(ctx).input("MonthKey", sql.Char(7), monthKey).input("CurrentMonthKey", sql.Char(7), ctx.monthKey).execute("dbo.usp_Salon_Payout_List")
            : Promise.resolve(null),
    ]);
    return {
        bills: rows(bills.recordset).map(map.bill),
        adjustments: rows(adjustments.recordset).map(map.adjustment),
        expenses: rows(expenses.recordset).map(map.expense),
        closings: rows(closings.recordset).map(map.closing),
        payouts: payouts ? rows(payouts.recordset).filter((r) => r.IsPaid).map((r) => map.paidPayout(r, monthKey)) : [],
    };
}

// POST /api/salon/state  { organizationId, branchId }
// Masters + this month and last month of bills/adjustments/expenses/closings
// (+ paid payouts of the last 3 months and the audit log for the owner).
const getSalonState = handle(async (req, res) => {
    const ctx = await salonContext(req);

    const settingsResult = await scoped(ctx).execute("dbo.usp_Salon_Settings_Get");
    const settings = map.settings(rows(settingsResult.recordset)[0]);

    const base = { isOwner: ctx.isOwner, today: ctx.today, now: ctx.now, monthKey: ctx.monthKey, currentUser: ctx.userName };
    if (!settings) return ok(res, { ...base, setupRequired: true });

    const prev = shiftMonth(ctx.monthKey, -1);
    const [staff, rules, services, products, current, previous, older2, older3, audit] = await Promise.all([
        scoped(ctx).input("MonthKey", sql.Char(7), ctx.monthKey).input("IncludeInactive", sql.Bit, 1).execute("dbo.usp_Salon_Staff_List"),
        scoped(ctx).execute("dbo.usp_Salon_CommissionRule_List"),
        scoped(ctx).input("MonthKey", sql.Char(7), ctx.monthKey).input("IncludeInactive", sql.Bit, 1).execute("dbo.usp_Salon_Service_List"),
        scoped(ctx).input("MonthKey", sql.Char(7), ctx.monthKey).input("IncludeInactive", sql.Bit, 1).execute("dbo.usp_Salon_Product_List"),
        loadMonth(ctx, ctx.monthKey, { withPayouts: false }),
        loadMonth(ctx, prev, { withPayouts: ctx.isOwner }),
        ctx.isOwner
            ? scoped(ctx).input("MonthKey", sql.Char(7), shiftMonth(ctx.monthKey, -2)).input("CurrentMonthKey", sql.Char(7), ctx.monthKey).execute("dbo.usp_Salon_Payout_List")
            : Promise.resolve(null),
        ctx.isOwner
            ? scoped(ctx).input("MonthKey", sql.Char(7), shiftMonth(ctx.monthKey, -3)).input("CurrentMonthKey", sql.Char(7), ctx.monthKey).execute("dbo.usp_Salon_Payout_List")
            : Promise.resolve(null),
        ctx.isOwner
            ? scoped(ctx).input("FromDate", sql.Date, `${shiftMonth(ctx.monthKey, -2)}-01`).execute("dbo.usp_Salon_AuditLog_List")
            : Promise.resolve(null),
    ]);

    const paid = (result, mk) => (result ? rows(result.recordset).filter((r) => r.IsPaid).map((r) => map.paidPayout(r, mk)) : []);

    ok(res, {
        ...base,
        setupRequired: false,
        settings,
        staff: rows(staff.recordset).map(map.staff),
        rules: rows(rules.recordset).map(map.rule),
        services: rows(services.recordset).map(map.service),
        products: rows(products.recordset).map(map.product),
        bills: [...current.bills, ...previous.bills],
        adjustments: [...current.adjustments, ...previous.adjustments],
        expenses: [...current.expenses, ...previous.expenses],
        closings: [...current.closings, ...previous.closings],
        payouts: [...previous.payouts, ...paid(older2, shiftMonth(ctx.monthKey, -2)), ...paid(older3, shiftMonth(ctx.monthKey, -3))],
        audit: audit ? rows(audit.recordset).map(map.audit) : [],
        loadedMonths: [ctx.monthKey, prev],
    }, "Salon loaded");
});

// POST /api/salon/month  { organizationId, branchId, monthKey }  — older month on demand
const getSalonMonth = handle(async (req, res) => {
    const ctx = await salonContext(req);
    const { monthKey } = req.body;
    if (!isMonthKey(monthKey) || monthKey > ctx.monthKey) throw new HttpError(400, "Invalid month.");
    const data = await loadMonth(ctx, monthKey, { withPayouts: ctx.isOwner });
    ok(res, { monthKey, ...data });
});

// POST /api/salon/settings/save  (owner)
const saveSalonSettings = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/settings", ownerOnly: true });
    const f = req.body;
    const result = await scoped(ctx)
        .input("SalonName", sql.NVarChar(150), f.salonName)
        .input("BranchName", sql.NVarChar(150), f.branchName || null)
        .input("Phone", sql.NVarChar(30), f.phone || null)
        .input("Address", sql.NVarChar(300), f.address || null)
        .input("LogoUrl", sql.NVarChar(500), f.logo || null)
        .input("TRN", sql.NVarChar(20), f.trn || null)
        .input("VatEnabled", sql.Bit, f.vatEnabled ? 1 : 0)
        .input("VatRate", sql.Decimal(5, 2), Number(f.vatRate) || 0)
        .input("DiscountMode", sql.NVarChar(10), f.discountMode === "owner" ? "owner" : "shared")
        .input("ReceiptFooter", sql.NVarChar(300), f.receiptFooter || null)
        .input("OpeningFloat", sql.Decimal(12, 2), Number(f.openingFloat) || 0)
        .input("PrinterWidth", sql.NVarChar(5), f.printerWidth === "58" ? "58" : "80")
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Settings_Save");
    ok(res, map.settings(rows(result.recordset)[0]), "Settings saved");
});

// POST /api/salon/setup/initialize  (owner) — first-time setup of a salon branch
const initializeSalon = handle(async (req, res) => {
    const ctx = await salonContext(req, { ownerOnly: true });
    if (!String(req.body.salonName || "").trim()) throw new HttpError(400, "Salon name is required.");
    await scoped(ctx)
        .input("SalonName", sql.NVarChar(150), req.body.salonName.trim())
        .input("BranchName", sql.NVarChar(150), req.body.branchName || null)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Setup_Initialize");
    ok(res, { initialized: true }, "Salon initialised");
});

module.exports = { getSalonState, getSalonMonth, saveSalonSettings, initializeSalon };
