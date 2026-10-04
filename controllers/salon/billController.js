const { sql, salonContext, scoped, handle, ok, rows, toSqlDateTime, isDateKey, HttpError } = require("./_shared");
const map = require("./_mappers");

const MAX_SYNC_BATCH = 50;

// One bill from the device -> usp_Salon_Bill_Save (idempotent on the device UUID).
async function saveOne(ctx, b, deviceId) {
    const billAt = toSqlDateTime(b.createdAt) || ctx.now;
    const lines = (b.lines || []).map((l) => ({
        type: l.type === "product" ? "product" : "service",
        refId: l.refId || null,
        name: l.name,
        category: l.category || null,
        price: Number(l.price),
        qty: Number(l.qty),
    }));
    const payments = (b.payments || []).map((p) => ({ method: p.method, amount: Number(p.amount) }));

    const result = await scoped(ctx)
        .input("ID2", sql.NVarChar(65), b.id)
        .input("StaffID", sql.NVarChar(65), b.staffId)
        .input("BillAt", sql.NVarChar(30), billAt)
        .input("CustomerPhone", sql.NVarChar(30), b.customerPhone || null)
        .input("Discount", sql.Decimal(12, 2), Number(b.discount) || 0)
        .input("Tip", sql.Decimal(12, 2), Number(b.tip) || 0)
        .input("VatRate", sql.Decimal(5, 2), b.vatRate == null ? null : Number(b.vatRate))
        .input("DiscountMode", sql.NVarChar(10), b.discountMode || null)
        .input("Lines", sql.NVarChar(sql.MAX), JSON.stringify(lines))
        .input("Payments", sql.NVarChar(sql.MAX), JSON.stringify(payments))
        .input("DeviceId", sql.NVarChar(100), deviceId || null)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Bill_Save");

    return map.bill(rows(result.recordset)[0]);
}

// POST /api/salon/bill/save  { organizationId, branchId, bill, deviceId }
const saveBill = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/billing" });
    const b = req.body.bill;
    if (!b || !b.id) throw new HttpError(400, "Bill is missing.");
    ok(res, await saveOne(ctx, b, req.body.deviceId), "Bill saved");
});

// POST /api/salon/bills/sync  { organizationId, branchId, bills: [...], deviceId }
// Offline queue upload. Each bill is saved on its own so one bad bill doesn't
// block the rest; already-saved bills come back as saved (idempotent).
const syncBills = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/billing" });
    const bills = Array.isArray(req.body.bills) ? req.body.bills.slice(0, MAX_SYNC_BATCH) : [];
    const results = [];
    for (const b of bills) {
        try {
            results.push({ id: b.id, ok: true, bill: await saveOne(ctx, b, req.body.deviceId) });
        } catch (error) {
            results.push({ id: b.id, ok: false, message: error.message });
        }
    }
    ok(res, results, `${results.filter((r) => r.ok).length} of ${results.length} bills synced`);
});

// POST /api/salon/bills  { fromDate, toDate, staffId?, payment?, status?, search? }
const listBills = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/bills" });
    const f = req.body;
    const from = isDateKey(f.fromDate) ? f.fromDate : ctx.today;
    const to = isDateKey(f.toDate) ? f.toDate : from;
    const result = await scoped(ctx)
        .input("FromDate", sql.Date, from)
        .input("ToDate", sql.Date, to)
        .input("StaffID", sql.NVarChar(65), f.staffId || null)
        .input("Payment", sql.NVarChar(10), f.payment || null)
        .input("StatusId", sql.NVarChar(15), f.status ? f.status[0].toUpperCase() + f.status.slice(1) : null)
        .input("Search", sql.NVarChar(100), f.search || null)
        .execute("dbo.usp_Salon_Bill_List");
    ok(res, rows(result.recordset).map(map.bill));
});

// POST /api/salon/bill/edit  { id, staffId?, paymentMethod? (cash|card|split), splitCash?, reason }
const editBill = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/bills" });
    const f = req.body;
    const result = await scoped(ctx)
        .input("ID2", sql.NVarChar(65), f.id)
        .input("StaffID", sql.NVarChar(65), f.staffId || null)
        .input("PaymentMethod", sql.NVarChar(10), f.paymentMethod || null)
        .input("SplitCash", sql.Decimal(12, 2), f.splitCash == null ? null : Number(f.splitCash))
        .input("Reason", sql.NVarChar(300), f.reason || "")
        .input("IsOwner", sql.Bit, ctx.isOwner ? 1 : 0)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Bill_Edit");
    ok(res, map.bill(rows(result.recordset)[0]), "Bill updated");
});

// POST /api/salon/bill/cancel  { id, reason }
const cancelBill = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/bills" });
    const result = await scoped(ctx)
        .input("ID2", sql.NVarChar(65), req.body.id)
        .input("Reason", sql.NVarChar(300), req.body.reason || "")
        .input("IsOwner", sql.Bit, ctx.isOwner ? 1 : 0)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Bill_Cancel");
    ok(res, map.bill(rows(result.recordset)[0]), "Bill cancelled");
});

module.exports = { saveBill, syncBills, listBills, editBill, cancelBill };
