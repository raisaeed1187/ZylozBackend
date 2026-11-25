// Dashboard > Pending Approvals
// One list of everything waiting for the logged-in user's approval, across all
// organizations the user can access, with Approve / Reject from the dashboard.
//
// The action is sent to the SAME logic each module's own screen uses, so the
// record (payroll, PO, quotation, timesheet) changes, not only ApprovalRequest:
//   Payroll   -> PayrollMaster_ChangeStatus (5 approve / 3 reject)        = Run Payroll screen
//   PO        -> RFQ_Change_Status          (5 approve / 16 reject)       = RFQ / PO screen
//   Quotation -> usp_Quotation_ApprovalAction (status-only, no form save)
//   Timesheet -> processTimesheetBatchAction (applies days at final level) = Timesheet screen
//
// SQL: Frontend/sql/Approval_Pending_Inbox.sql

const sql = require("mssql");
const store = require("../store");
const { setCurrentDatabase, setCurrentUser } = require("../constents").actions;
const { tenantScopedRequest, setTenantContext } = require("../helper/db/sqlTenant");
const { processTimesheetBatchAction } = require("./hr/attendanceTimesheetController");

const TYPES = {
  Payroll:   { label: "Payroll" },
  PO:        { label: "Purchase Order", waitingStatus: 4 },
  Quotation: { label: "Quotation", waitingStatus: 5 },
  Timesheet: { label: "Attendance Timesheet" },
};

function connectUserDb(req) {
  store.dispatch(setCurrentDatabase(req.authUser.database));
  store.dispatch(setCurrentUser(req.authUser));
  return sql.connect(store.getState().constents.config);
}

// first non-empty value among the keys, case-insensitive (detail procs differ in naming)
function pick(row, keys) {
  if (!row) return null;
  const lower = {};
  for (const k of Object.keys(row)) lower[k.toLowerCase()] = row[k];
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

// organizations of the user = same list the login gets (UsersAccessInfo_Get, 3rd recordset)
async function userOrganizations(pool, req) {
  const r = await pool.request()
    .input("UserID", sql.NVarChar, req.authUser.ID2)
    .execute("UsersAccessInfo_Get");
  return (r.recordsets[2] || [])
    .map((o) => ({ id: pick(o, ["ID2"]), name: pick(o, ["Organization Name", "OrganizationName", "Name"]) }))
    .filter((o) => o.id);
}

async function loadPending(pool, req, orgs, { transactionType = null, transactionId = null } = {}) {
  if (!orgs.length) return [];
  const r = await tenantScopedRequest(pool, req)
    .input("TenantId", sql.NVarChar(100), req.authUser.tenantId)
    .input("UserId", sql.NVarChar(65), req.authUser.ID2)
    .input("UserName", sql.NVarChar(100), req.authUser.username)
    .input("OrganizationIds", sql.NVarChar(sql.MAX), orgs.map((o) => o.id).join(","))
    .input("TransactionType", sql.NVarChar(50), transactionType)
    .input("TransactionId", sql.NVarChar(65), transactionId)
    .query("EXEC dbo.usp_Approval_PendingForUser @TenantId, @UserId, @UserName, @OrganizationIds, @TransactionType, @TransactionId");
  return r.recordset || [];
}

// first row of the first result set that has rows
const firstRow = (r) => (r.recordsets || [r.recordset]).find((rs) => rs && rs.length > 0)?.[0];

// PO / Quotation details through their existing detail procs (no table names guessed here).
// Called exactly like their own screens (getRFQDetails / getQuotationDetails):
// setTenantContext, then a direct call of the proc.
async function loadDetails(pool, req, item) {
  if (item.TransactionType === "PO") {
    await setTenantContext(pool, req);
    const r = await pool.request()
      .input("ID2", sql.NVarChar(65), item.TransactionId)
      .input("OrganizationId", sql.NVarChar(65), null)
      .input("VendorId", sql.NVarChar(65), null)
      .execute("RFQ_Get");
    const row = firstRow(r);
    return row && {
      statusId: Number(pick(row, ["statusId", "StatusId"])),
      reference: pick(row, ["rfqCode", "poNo", "PONo", "orderNo", "rfqNo", "referenceNo"]),
      party: pick(row, ["vendorName", "VendorName", "company"]),
      amount: pick(row, ["totalAmount", "TotalAmount", "grandTotal", "netTotal", "total", "amount"]),
      currency: pick(row, ["currency", "Currency"]),
    };
  }
  if (item.TransactionType === "Quotation") {
    await setTenantContext(pool, req);
    const r = await pool.request()
      .input("Id", sql.NVarChar(65), item.TransactionId)
      .query("exec getQuotationDetails @Id");
    const row = firstRow(r);
    return row && {
      statusId: Number(pick(row, ["statusId", "StatusId"])),
      reference: pick(row, ["quotationNo", "QuotationNo", "referenceNo"]),
      party: pick(row, ["customerName", "CustomerName", "customer"]),
      amount: pick(row, ["totalAmount", "TotalAmount", "grandTotal", "netTotal", "netAmount", "total", "amount"]),
      currency: pick(row, ["currency", "Currency"]),
    };
  }
  return null;
}

async function shape(pool, req, rows, orgs) {
  const orgName = new Map(orgs.map((o) => [String(o.id), o.name]));
  const items = [];
  for (const row of rows) {
    const item = {
      approvalRequestId: row.ApprovalRequestId,
      transactionId: row.TransactionId,
      type: row.TransactionType,
      typeLabel: TYPES[row.TransactionType]?.label || row.TransactionType,
      organizationId: row.OrganizationId,
      organizationName: orgName.get(String(row.OrganizationId)) || null,
      level: row.Level,
      totalLevels: row.TotalLevels,
      asDelegate: !!row.AsDelegate,
      submittedBy: row.SubmittedBy,
      submittedAt: row.SubmittedAt,
      reference: row.Reference,
      party: null,
      amount: row.Amount,
      currency: null,
      employees: row.Employees,
      days: row.Days,
      remarks: row.Remarks,
    };

    const waiting = TYPES[item.type]?.waitingStatus;
    if (waiting) {
      try {
        const d = await loadDetails(pool, req, { TransactionType: item.type, TransactionId: item.transactionId });
        if (!d) { // record no longer there
          console.log(`Pending approvals: ${item.type} ${item.transactionId} hidden - detail proc returned no row`);
          continue;
        }
        if (Number.isFinite(d.statusId) && d.statusId !== waiting) { // moved on (stale request)
          console.log(`Pending approvals: ${item.type} ${item.transactionId} hidden - statusId ${d.statusId}, expected ${waiting}`);
          continue;
        }
        item.reference = d.reference || item.reference;
        item.party = d.party;
        item.amount = d.amount ?? item.amount;
        item.currency = d.currency;
      } catch (err) {
        console.error(`Pending approvals: details of ${item.type} ${item.transactionId} failed:`, err.message);
      }
    }
    items.push(item);
  }
  return items;
}

// POST /api/approvals/pending
const getPendingApprovals = async (req, res) => {
  try {
    const pool = await connectUserDb(req);
    const orgs = await userOrganizations(pool, req);
    const items = await shape(pool, req, await loadPending(pool, req, orgs), orgs);

    const counts = {};
    for (const i of items) counts[i.type] = (counts[i.type] || 0) + 1;

    res.status(200).json({ message: "Pending approvals loaded", data: { items, counts, total: items.length } });
  } catch (error) {
    res.status(400).json({ message: error.message, data: null });
  }
};

const HANDLERS = {
  Payroll: async (pool, req, item, action, remarks) => {
    await tenantScopedRequest(pool, req)
      .input("payrollMasterId", sql.NVarChar(100), item.TransactionId)
      .input("StatusId", sql.Int, action === "Approve" ? 5 : 3)
      .input("OrganizationId", sql.NVarChar(100), item.OrganizationId)
      .input("userName", sql.NVarChar(100), req.authUser.username)
      .input("Remarks", sql.NVarChar(sql.MAX), remarks || null)
      .query("EXEC PayrollMaster_ChangeStatus @payrollMasterId, @StatusId, @OrganizationId, @userName, @Remarks");
    return {};
  },
  PO: async (pool, req, item, action) => {
    await tenantScopedRequest(pool, req)
      .input("ID2", sql.NVarChar(65), item.TransactionId)
      .input("StatusId", sql.Int, action === "Approve" ? 5 : 16)
      .input("OrganizationID", sql.NVarChar(65), item.OrganizationId)
      .input("CurrentUser", sql.NVarChar(65), req.authUser.username)
      .query("EXEC RFQ_Change_Status @ID2 = @ID2, @StatusId = @StatusId, @OrganizationID = @OrganizationID, @CurrentUser = @CurrentUser");
    return {};
  },
  Quotation: async (pool, req, item, action, remarks) => {
    let amount = null;
    try {
      const d = await loadDetails(pool, req, { TransactionType: "Quotation", TransactionId: item.TransactionId });
      amount = d?.amount != null && Number.isFinite(Number(d.amount)) ? Number(d.amount) : null;
    } catch (e) { /* amount is only for the approval history */ }
    const r = await tenantScopedRequest(pool, req)
      .input("QuotationId", sql.NVarChar(65), item.TransactionId)
      .input("Action", sql.NVarChar(20), action)
      .input("UserName", sql.NVarChar(100), req.authUser.username)
      .input("Remarks", sql.NVarChar(sql.MAX), remarks || null)
      .input("Amount", sql.Decimal(18, 2), amount)
      .query("EXEC dbo.usp_Quotation_ApprovalAction @QuotationId, @Action, @UserName, @Remarks, @Amount");
    return { message: r.recordset?.[0]?.Message };
  },
  Timesheet: async (pool, req, item, action, remarks) => {
    const r = await processTimesheetBatchAction(pool, req, { batchId: item.TransactionId, action, remarks });
    return { message: r.message, data: r.data };
  },
};

// POST /api/approvals/action { type, transactionId, action: 'Approve' | 'Reject', remarks }
const approvalAction = async (req, res) => {
  try {
    const { type, transactionId, action } = req.body;
    const remarks = String(req.body.remarks || "").trim();
    if (!HANDLERS[type]) return res.status(400).json({ message: "This approval type cannot be approved from the dashboard." });
    if (!["Approve", "Reject"].includes(action)) return res.status(400).json({ message: "Action must be Approve or Reject." });
    if (!transactionId) return res.status(400).json({ message: "Transaction is required." });
    if (action === "Reject" && !remarks) return res.status(400).json({ message: "Enter a reason for rejecting." });

    const pool = await connectUserDb(req);
    const orgs = await userOrganizations(pool, req);

    // still waiting for THIS user (someone else may have acted, or it moved on)
    const [item] = await loadPending(pool, req, orgs, { transactionType: type, transactionId });
    if (!item) return res.status(400).json({ message: "This item is no longer waiting for your approval. Refresh the list." });

    const result = await HANDLERS[type](pool, req, item, action, remarks);

    // final state of the request, for a uniform message
    const st = await tenantScopedRequest(pool, req)
      .input("Id", sql.NVarChar(65), item.ApprovalRequestId)
      .query("SELECT Status, CurrentLevelNumber FROM dbo.ApprovalRequest WHERE ID2 = @Id");
    const status = st.recordset?.[0]?.Status;
    const fallback = status === "Approved" ? "Approved."
      : status === "Rejected" ? "Rejected."
      : "Approved at this level; waiting for the next approver.";

    res.status(200).json({
      message: result.message || fallback,
      data: { approvalStatus: status, level: st.recordset?.[0]?.CurrentLevelNumber, ...(result.data || {}) },
    });
  } catch (error) {
    res.status(400).json({ message: error.message, data: null });
  }
};

module.exports = { getPendingApprovals, approvalAction };
