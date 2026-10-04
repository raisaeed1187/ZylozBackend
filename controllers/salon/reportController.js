// Server-side dashboard and reports (owner). The screens currently compute the
// current/previous month from /api/salon/state; these endpoints serve any date
// range straight from SQL (long ranges, exports, future multi-branch views).
const { sql, salonContext, scoped, handle, ok, rows, json, isDateKey, HttpError } = require("./_shared");
const map = require("./_mappers");

const range = (ctx, body) => {
    const from = isDateKey(body.fromDate) ? body.fromDate : `${ctx.monthKey}-01`;
    const to = isDateKey(body.toDate) ? body.toDate : ctx.today;
    if (from > to) throw new HttpError(400, "From date is after To date.");
    return { from, to };
};

// POST /api/salon/dashboard
const getDashboard = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/dashboard", ownerOnly: true });
    const r = await scoped(ctx)
        .input("Today", sql.Date, ctx.today)
        .input("Now", sql.NVarChar(30), ctx.now)
        .execute("dbo.usp_Salon_Dashboard");
    const [today, month, daily, board, alerts, latest, payable] = r.recordsets.map(rows);
    ok(res, {
        today: today[0],
        month: month[0],
        daily,
        board,
        alerts: alerts[0] ? { ...alerts[0], LowStock: json(alerts[0].LowStock) } : null,
        latest,
        payable,
    });
});

// POST /api/salon/reports/barbers  { fromDate, toDate, finaliseTarget }
const reportBarbers = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/reports", ownerOnly: true });
    const { from, to } = range(ctx, req.body);
    const r = await scoped(ctx)
        .input("FromDate", sql.Date, from).input("ToDate", sql.Date, to)
        .input("FinaliseTarget", sql.Bit, req.body.finaliseTarget ? 1 : 0)
        .execute("dbo.usp_Salon_Report_Barbers");
    ok(res, rows(r.recordset));
});

// POST /api/salon/reports/services  { fromDate, toDate }
const reportServices = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/reports", ownerOnly: true });
    const { from, to } = range(ctx, req.body);
    const r = await scoped(ctx).input("FromDate", sql.Date, from).input("ToDate", sql.Date, to).execute("dbo.usp_Salon_Report_Services");
    ok(res, rows(r.recordset));
});

// POST /api/salon/reports/profit-loss  { fromDate, toDate }
const reportProfitLoss = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/reports", ownerOnly: true });
    const { from, to } = range(ctx, req.body);
    const r = await scoped(ctx).input("FromDate", sql.Date, from).input("ToDate", sql.Date, to).execute("dbo.usp_Salon_Report_ProfitLoss");
    const [summary, byCategory, daily] = r.recordsets.map(rows);
    ok(res, { summary: summary[0], byCategory, daily });
});

// POST /api/salon/reports/audit-log  { fromDate?, toDate?, entity? }
const reportAuditLog = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/reports", ownerOnly: true });
    const r = await scoped(ctx)
        .input("FromDate", sql.Date, isDateKey(req.body.fromDate) ? req.body.fromDate : null)
        .input("ToDate", sql.Date, isDateKey(req.body.toDate) ? req.body.toDate : null)
        .input("Entity", sql.NVarChar(30), req.body.entity || null)
        .execute("dbo.usp_Salon_AuditLog_List");
    ok(res, rows(r.recordset).map(map.audit));
});

module.exports = { getDashboard, reportBarbers, reportServices, reportProfitLoss, reportAuditLog };
