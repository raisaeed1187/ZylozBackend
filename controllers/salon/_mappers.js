// Procedure rows -> the shapes the Salon screens use (src/store/salon/salonSlice.jsx).
const { json, num } = require("./_shared");

const settings = (r) => (r ? {
    id: r.ID2,
    salonName: r.SalonName,
    branchName: r.BranchName || "",
    phone: r.Phone || "",
    address: r.Address || "",
    logo: r.LogoUrl || null,
    trn: r.TRN || "",
    vatEnabled: !!r.VatEnabled,
    vatRate: num(r.VatRate),
    discountMode: r.DiscountMode,
    receiptFooter: r.ReceiptFooter || "",
    openingFloat: num(r.OpeningFloat),
    printerWidth: r.PrinterWidth || "80",
    currency: r.Currency || "AED",
} : null);

const staff = (r) => ({
    id: r.ID2,
    name: r.StaffName,
    phone: r.Phone || "",
    ruleId: r.RuleID,
    ruleName: r.RuleName || "",
    salary: num(r.Salary),
    monthlyTarget: num(r.MonthlyTarget),
    joinedOn: r.JoinedOn || null,
    tone: num(r.AvatarTone),
    sortOrder: num(r.SortOrder),
    active: r.IsActive === undefined ? true : !!r.IsActive,
    hasPin: !!r.HasPin,
    pin: "", // never sent; blank in the form = keep the current PIN
});

const rule = (r) => ({
    id: r.ID2,
    name: r.RuleName,
    type: r.RuleType,
    percent: num(r.BasePercent),
    productPercent: r.ProductPercent == null ? null : num(r.ProductPercent),
    targetAmount: num(r.TargetAmount),
    aboveTargetPercent: num(r.AboveTargetPercent),
    salary: num(r.SalaryAmount),
    active: !!r.IsActive,
    assignedCount: num(r.AssignedCount),
    items: json(r.Items).map((i) => ({ id: i.id, serviceId: i.serviceId || null, category: i.category || null, percent: num(i.percent) })),
});

const service = (r) => ({
    id: r.ID2,
    name: r.ServiceName,
    category: r.Category,
    price: num(r.Price),
    duration: num(r.DurationMin),
    popular: !!r.IsPopular,
    sortOrder: num(r.SortOrder),
    active: r.IsActive === undefined ? true : !!r.IsActive,
    soldThisMonth: num(r.SoldThisMonth),
});

const product = (r) => ({
    id: r.ID2,
    name: r.ProductName,
    category: "products",
    price: num(r.Price),
    stock: num(r.StockQty),
    lowStockAt: num(r.LowStockAt),
    active: r.IsActive === undefined ? true : !!r.IsActive,
    soldThisMonth: num(r.SoldThisMonth),
});

const STATUS = { Completed: "completed", Edited: "edited", Cancelled: "cancelled" };

const bill = (r) => {
    const lines = json(r.Lines).map((l) => ({
        type: l.type,
        refId: l.refId,
        name: l.name,
        category: l.category,
        price: num(l.price),
        qty: num(l.qty),
        lineTotal: num(l.lineTotal),
        discountShare: num(l.discountShare),
        commissionBase: num(l.commissionBase),
        commissionPercent: num(l.commissionPercent),
        commissionAmount: num(l.commissionAmount),
        provisional: !!l.provisional,
    }));
    return {
        id: r.ID2,
        billNo: r.BillNo,
        staffId: r.StaffID,
        staffName: r.StaffName || "",
        customerPhone: r.CustomerPhone || "",
        lines,
        subtotal: num(r.Subtotal),
        discount: num(r.Discount),
        net: num(r.NetAmount),
        vatRate: num(r.VatRate),
        vat: num(r.VatAmount),
        total: num(r.Total),
        tip: num(r.Tip),
        grandTotal: num(r.GrandTotal),
        commission: num(r.CommissionTotal),
        payments: json(r.Payments).map((p) => ({ method: p.method, amount: num(p.amount) })),
        status: STATUS[r.StatusId] || "completed",
        cancelReason: r.CancelReason || "",
        createdAt: r.BillAt,
        billDate: r.BillDate,
        createdBy: r.CreatedBy || "",
        editedAt: r.UpdatedAt || null,
        isDayClosed: !!r.IsDayClosed,
        synced: true,
    };
};

const adjustment = (r) => ({
    id: r.ID2,
    staffId: r.StaffID,
    type: r.AdjType,
    amount: num(r.Amount),
    date: r.AdjDate,
    note: r.Note || "",
    paidFromDrawer: !!r.PaidFromDrawer,
    by: r.CreatedBy || "",
});

const expense = (r) => ({
    id: r.ID2,
    category: r.Category,
    amount: num(r.Amount),
    date: r.ExpenseDate,
    note: r.Note || "",
    paidFromDrawer: !!r.PaidFromDrawer,
    by: r.CreatedBy || "",
});

const closing = (r) => ({
    id: r.ID2,
    dateKey: r.CloseDate,
    bills: num(r.BillsCount),
    sales: num(r.Sales),
    expectedCash: num(r.ExpectedCash),
    actualCash: num(r.ActualCash),
    expectedCard: num(r.ExpectedCard),
    actualCard: num(r.ActualCard),
    difference: num(r.Difference),
    reason: r.Reason || "",
    closedBy: r.ClosedBy || "",
    closedAt: r.ClosedAt,
    topBarber: r.TopBarber || undefined,
});

const expected = (r) => ({
    bills: num(r.BillsCount),
    cancelled: num(r.CancelledCount),
    sales: num(r.Sales),
    tips: num(r.Tips),
    openingFloat: num(r.OpeningFloat),
    cashSales: num(r.CashSales),
    cardSales: num(r.CardSales),
    advancesOut: num(r.AdvancesOut),
    cashExpenses: num(r.CashExpenses),
    expectedCash: num(r.ExpectedCash),
    expectedCard: num(r.ExpectedCard),
});

// Figures in the payslip shape (computePayout() in salonCalc.js).
const payoutFigures = (r) => ({
    staffId: r.StaffID,
    monthKey: r.MonthKey,
    jobs: num(r.Jobs),
    sales: num(r.Sales),
    commission: num(r.Commission),
    tips: num(r.Tips),
    salary: num(r.Salary),
    advances: num(r.Advances),
    deductions: num(r.Deductions),
    bonus: num(r.Bonus),
    net: num(r.NetPayable),
});

// Paid payout as kept in slice.payouts: { staffId, monthKey, paidAt, method, net, snapshot }
const paidPayout = (r, monthKey) => ({
    staffId: r.StaffID,
    monthKey: r.MonthKey || monthKey,
    paidAt: r.PaidAt,
    paidBy: r.PaidBy || "",
    method: r.PayMethod,
    net: num(r.NetPayable),
    snapshot: payoutFigures({ ...r, MonthKey: r.MonthKey || monthKey }),
});

const audit = (r) => ({
    id: r.ID2,
    entity: r.Entity,
    entityId: r.EntityID,
    action: r.Action,
    detail: r.Detail || "",
    reason: r.Reason || "",
    user: r.UserName || "",
    at: r.CreatedAt,
});

module.exports = { settings, staff, rule, service, product, bill, adjustment, expense, closing, expected, payoutFigures, paidPayout, audit };
