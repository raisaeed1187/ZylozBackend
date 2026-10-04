const { sql, bcrypt, salonContext, scoped, handle, ok, rows, HttpError } = require("./_shared");
const map = require("./_mappers");

const listStaff = async (ctx) => rows((await scoped(ctx)
    .input("MonthKey", sql.Char(7), ctx.monthKey).input("IncludeInactive", sql.Bit, 1)
    .execute("dbo.usp_Salon_Staff_List")).recordset).map(map.staff);
const listRules = async (ctx) => rows((await scoped(ctx).execute("dbo.usp_Salon_CommissionRule_List")).recordset).map(map.rule);
const listServices = async (ctx) => rows((await scoped(ctx)
    .input("MonthKey", sql.Char(7), ctx.monthKey).input("IncludeInactive", sql.Bit, 1)
    .execute("dbo.usp_Salon_Service_List")).recordset).map(map.service);
const listProducts = async (ctx) => rows((await scoped(ctx)
    .input("MonthKey", sql.Char(7), ctx.monthKey).input("IncludeInactive", sql.Bit, 1)
    .execute("dbo.usp_Salon_Product_List")).recordset).map(map.product);

// POST /api/salon/staff/save  (owner)
// body: { id?, name, phone, pin? (4 digits; blank = keep), ruleId, salary, monthlyTarget, joinedOn, tone, active }
const saveStaff = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/barbers", ownerOnly: true });
    const f = req.body;
    const pin = String(f.pin || "").trim();
    if (pin && !/^\d{4}$/.test(pin)) throw new HttpError(400, "PIN must be 4 digits.");

    await scoped(ctx)
        .input("ID2", sql.NVarChar(65), f.id || null)
        .input("StaffName", sql.NVarChar(150), f.name)
        .input("Phone", sql.NVarChar(30), f.phone || null)
        .input("PinHash", sql.NVarChar(128), pin ? await bcrypt.hash(pin, 10) : null)
        .input("RuleID", sql.NVarChar(65), f.ruleId || null)
        .input("Salary", sql.Decimal(12, 2), Number(f.salary) || 0)
        .input("MonthlyTarget", sql.Decimal(12, 2), Number(f.monthlyTarget) || 0)
        .input("JoinedOn", sql.Date, f.joinedOn || null)
        .input("AvatarTone", sql.TinyInt, f.tone == null ? null : Number(f.tone) % 6)
        .input("SortOrder", sql.Int, Number(f.sortOrder) || 0)
        .input("IsActive", sql.Bit, f.active === false ? 0 : 1)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Staff_SaveUpdate");

    ok(res, await listStaff(ctx), "Barber saved");
});

// POST /api/salon/rule/save  (owner)
// body: { id?, name, type, percent, productPercent, targetAmount, aboveTargetPercent, salary, items:[{serviceId, category, percent}] }
const saveRule = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/commission-rules", ownerOnly: true });
    const f = req.body;
    await scoped(ctx)
        .input("ID2", sql.NVarChar(65), f.id || null)
        .input("RuleName", sql.NVarChar(100), f.name)
        .input("RuleType", sql.NVarChar(20), f.type)
        .input("BasePercent", sql.Decimal(6, 2), Number(f.percent) || 0)
        .input("ProductPercent", sql.Decimal(6, 2), f.productPercent === "" || f.productPercent == null ? null : Number(f.productPercent))
        .input("TargetAmount", sql.Decimal(12, 2), Number(f.targetAmount) || 0)
        .input("AboveTargetPercent", sql.Decimal(6, 2), Number(f.aboveTargetPercent) || 0)
        .input("SalaryAmount", sql.Decimal(12, 2), Number(f.salary) || 0)
        .input("Items", sql.NVarChar(sql.MAX), f.type === "per_service" ? JSON.stringify(f.items || []) : null)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_CommissionRule_SaveUpdate");

    ok(res, await listRules(ctx), "Commission rule saved");
});

// POST /api/salon/service/save  (owner)
const saveService = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/catalog", ownerOnly: true });
    const f = req.body;
    await scoped(ctx)
        .input("ID2", sql.NVarChar(65), f.id || null)
        .input("ServiceName", sql.NVarChar(150), f.name)
        .input("Category", sql.NVarChar(20), f.category)
        .input("Price", sql.Decimal(12, 2), Number(f.price) || 0)
        .input("DurationMin", sql.Int, Number(f.duration) || 0)
        .input("IsPopular", sql.Bit, f.popular ? 1 : 0)
        .input("SortOrder", sql.Int, Number(f.sortOrder) || 0)
        .input("IsActive", sql.Bit, f.active === false ? 0 : 1)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Service_SaveUpdate");

    ok(res, await listServices(ctx), "Service saved");
});

// POST /api/salon/product/save  (owner)
const saveProduct = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/catalog", ownerOnly: true });
    const f = req.body;
    await scoped(ctx)
        .input("ID2", sql.NVarChar(65), f.id || null)
        .input("ProductName", sql.NVarChar(150), f.name)
        .input("Price", sql.Decimal(12, 2), Number(f.price) || 0)
        .input("StockQty", sql.Int, Number(f.stock) || 0)
        .input("LowStockAt", sql.Int, f.lowStockAt == null ? 3 : Number(f.lowStockAt))
        .input("IsActive", sql.Bit, f.active === false ? 0 : 1)
        .input("UserName", sql.NVarChar(100), ctx.userName)
        .execute("dbo.usp_Salon_Product_SaveUpdate");

    ok(res, await listProducts(ctx), "Product saved");
});

// POST /api/salon/customer  { phone } — visit history for the billing screen
const getCustomer = handle(async (req, res) => {
    const ctx = await salonContext(req, { screen: "salon/billing" });
    const result = await ctx.pool.request()
        .input("TenantID", sql.NVarChar(65), ctx.tenantId)
        .input("OrganizationID", sql.NVarChar(65), ctx.organizationId)
        .input("Phone", sql.NVarChar(30), req.body.phone || "")
        .execute("dbo.usp_Salon_Customer_Lookup");
    const customer = rows(result.recordsets[0])[0] || null;
    ok(res, {
        customer: customer && { id: customer.ID2, phone: customer.Phone, name: customer.CustomerName || "", visits: customer.VisitCount, totalSpent: Number(customer.TotalSpent), lastVisitAt: customer.LastVisitAt },
        visits: rows(result.recordsets[1]).map((v) => ({ id: v.ID2, billNo: v.BillNo, at: v.BillAt, total: Number(v.Total), staffName: v.StaffName, items: v.Items })),
    });
});

module.exports = { saveStaff, saveRule, saveService, saveProduct, getCustomer };
