const { sql, salonContext, scoped, handle, ok, rows, toSqlDateTime, isDateKey, isMonthKey, HttpError } = require("./_shared");
const map = require("./_mappers");

// ───────────── Advances & deductions

// POST /api/salon/adjustment/save  { id?, staffId, type, amount, date (local), note, paidFromDrawer }
const saveAdjustment = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/advances" });
    const f = req.body;
    const result = await scoped(ctx)
        .input("ID2", sql.NVarChar(65), f.id || null)
        .input("StaffID", sql.NVarChar(65), f.staffId)
        .input("AdjType", sql.NVarChar(15), f.type)
        .input("Amount", sql.Decimal(12, 2), Number(f.amount) || 0)
        .input("AdjDate", sql.NVarChar(30), toSqlDateTime(f.date) || ctx.now)
        .input("Note", sql.NVarChar(300), f.note || null)
        .input("PaidFromDrawer", sql.Bit, f.paidFromDrawer ? 1 : 0)
        .input("IsOwner", sql.Bit, ctx.isOwner ? 1 : 0)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Adjustment_Save");
    ok(res, { id: result.recordset[0].ID2, by: ctx.userName }, "Saved");
});

// POST /api/salon/adjustment/delete  { id, reason? }  (owner)
const deleteAdjustment = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/advances", ownerOnly: true });
    await ctx.pool.request()
        .input("ID2", sql.NVarChar(65), req.body.id)
        .input("TenantID", sql.NVarChar(65), ctx.tenantId)
        .input("IsOwner", sql.Bit, 1)
        .input("Reason", sql.NVarChar(300), req.body.reason || null)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Adjustment_Delete");
    ok(res, { id: req.body.id }, "Deleted");
});

// ───────────── Expenses

// POST /api/salon/expense/save  { id?, category, amount, date (local), note, paidFromDrawer }
const saveExpense = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/expenses" });
    const f = req.body;
    const result = await scoped(ctx)
        .input("ID2", sql.NVarChar(65), f.id || null)
        .input("Category", sql.NVarChar(20), f.category)
        .input("Amount", sql.Decimal(12, 2), Number(f.amount) || 0)
        .input("ExpenseDate", sql.NVarChar(30), toSqlDateTime(f.date) || ctx.now)
        .input("Note", sql.NVarChar(300), f.note || null)
        .input("PaidFromDrawer", sql.Bit, f.paidFromDrawer ? 1 : 0)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Expense_Save");
    ok(res, { id: result.recordset[0].ID2, by: ctx.userName }, "Expense saved");
});

// POST /api/salon/expense/delete  { id, reason? }  (owner)
const deleteExpense = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/expenses", ownerOnly: true });
    await ctx.pool.request()
        .input("ID2", sql.NVarChar(65), req.body.id)
        .input("TenantID", sql.NVarChar(65), ctx.tenantId)
        .input("IsOwner", sql.Bit, 1)
        .input("Reason", sql.NVarChar(300), req.body.reason || null)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Expense_Delete");
    ok(res, { id: req.body.id }, "Deleted");
});

// ───────────── Daily closing

// POST /api/salon/closing/expected  { dateKey }  — what the server expects in the drawer
const getClosingExpected = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/day-closing" });
    const dateKey = isDateKey(req.body.dateKey) ? req.body.dateKey : ctx.today;
    const result = await scoped(ctx).input("CloseDate", sql.Date, dateKey).execute("dbo.usp_Salon_DayClosing_Expected");
    const closing = rows(result.recordsets[1])[0];
    ok(res, { dateKey, expected: map.expected(rows(result.recordsets[0])[0]), closing: closing ? map.closing(closing) : null });
});

// POST /api/salon/closing/close  { dateKey, actualCash, actualCard, reason? }
const closeDay = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/day-closing" });
    const f = req.body;
    if (!isDateKey(f.dateKey)) throw new HttpError(400, "Invalid date.");
    const result = await scoped(ctx)
        .input("CloseDate", sql.Date, f.dateKey)
        .input("Today", sql.Date, ctx.today)
        .input("ActualCash", sql.Decimal(12, 2), f.actualCash == null || f.actualCash === "" ? null : Number(f.actualCash))
        .input("ActualCard", sql.Decimal(12, 2), f.actualCard == null || f.actualCard === "" ? null : Number(f.actualCard))
        .input("Reason", sql.NVarChar(300), f.reason || null)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_DayClosing_Close");
    ok(res, map.closing(rows(result.recordset)[0]), "Day closed");
});

// POST /api/salon/closing/reopen  { dateKey, reason }  (owner)
const reopenDay = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/day-closing", ownerOnly: true });
    if (!isDateKey(req.body.dateKey)) throw new HttpError(400, "Invalid date.");
    await scoped(ctx)
        .input("CloseDate", sql.Date, req.body.dateKey)
        .input("Reason", sql.NVarChar(300), req.body.reason || "")
        .input("IsOwner", sql.Bit, 1)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_DayClosing_Reopen");
    ok(res, { dateKey: req.body.dateKey }, "Day reopened");
});

// ───────────── Payouts (owner)

// POST /api/salon/payouts  { monthKey } — server-computed payout rows (fn_Salon_PayoutCalc)
const listPayouts = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/payouts", ownerOnly: true });
    const monthKey = isMonthKey(req.body.monthKey) ? req.body.monthKey : ctx.monthKey;
    const result = await scoped(ctx)
        .input("MonthKey", sql.Char(7), monthKey)
        .input("CurrentMonthKey", sql.Char(7), ctx.monthKey)
        .execute("dbo.usp_Salon_Payout_List");
    ok(res, {
        monthKey,
        rows: rows(result.recordsets[0]).map((r) => ({ ...map.payoutFigures({ ...r, MonthKey: monthKey }), isPaid: !!r.IsPaid, inProgress: !!r.InProgress, paid: r.IsPaid ? map.paidPayout(r, monthKey) : null })),
        totals: rows(result.recordsets[1])[0] || null,
    });
});

// POST /api/salon/payout/mark-paid  { staffId, monthKey, method: cash|bank }
const markPayoutPaid = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/payouts", ownerOnly: true });
    const f = req.body;
    if (!isMonthKey(f.monthKey)) throw new HttpError(400, "Invalid month.");
    const result = await scoped(ctx)
        .input("StaffID", sql.NVarChar(65), f.staffId)
        .input("MonthKey", sql.Char(7), f.monthKey)
        .input("CurrentMonthKey", sql.Char(7), ctx.monthKey)
        .input("PayMethod", sql.NVarChar(10), f.method === "bank" ? "bank" : "cash")
        .input("IsOwner", sql.Bit, 1)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Payout_MarkPaid");
    ok(res, map.paidPayout(rows(result.recordset)[0], f.monthKey), "Marked as paid");
});

// POST /api/salon/payout/undo  { staffId, monthKey, reason? }
const undoPayout = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/payouts", ownerOnly: true });
    await ctx.pool.request()
        .input("TenantID", sql.NVarChar(65), ctx.tenantId)
        .input("StaffID", sql.NVarChar(65), req.body.staffId)
        .input("MonthKey", sql.Char(7), req.body.monthKey)
        .input("Reason", sql.NVarChar(300), req.body.reason || null)
        .input("IsOwner", sql.Bit, 1)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Payout_Undo");
    ok(res, { staffId: req.body.staffId, monthKey: req.body.monthKey }, "Payout undone");
});

module.exports = {
    saveAdjustment, deleteAdjustment, saveExpense, deleteExpense,
    getClosingExpected, closeDay, reopenDay,
    listPayouts, markPayoutPaid, undoPayout,
};
