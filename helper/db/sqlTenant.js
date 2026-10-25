const sql = require("mssql");
const store = require("../../store");

async function getPool() {
  const config = store.getState().constents.config;
  return sql.connect(config);
}
 
// const setTenantContext = async (reqOrTransaction, req) => {
//     const request =
//         reqOrTransaction instanceof sql.Transaction
//             ? new sql.Request(reqOrTransaction)
//             : reqOrTransaction.request ? reqOrTransaction.request() : new sql.Request(reqOrTransaction);

//     const tenantId = req.authUser.tenantId;
//     return request
//         .input("tenantId", sql.NVarChar, tenantId)
//         .query(`EXEC sp_set_session_context @key=N'TenantId', @value=@tenantId`);
// };

const setTenantContext = async (connOrTran, req) => {
    let request;

    if (connOrTran instanceof sql.Transaction) { 
        request = new sql.Request(connOrTran);
    } else if (connOrTran instanceof sql.Request) { 
        request = connOrTran;
    } else { 
        request = connOrTran.request();
    }

    const tenantId = req.authUser.tenantId;
    return request
        .input("tenantId", sql.NVarChar, tenantId)
        .query(`EXEC sp_set_session_context @key=N'TenantId', @value=@tenantId`);
};

/**
 * Request that sets the tenant session context in the SAME batch as the query.
 * pool.request() may run on any pooled connection, so a context set by an
 * earlier request (setTenantContext) is not guaranteed to be on the connection
 * that runs this query; row-level security then sees no rows, or another
 * tenant's rows.
 *
 *   const result = await tenantScopedRequest(pool, req)
 *       .input('Id', sql.NVarChar(65), Id)
 *       .query('exec GetPayrollMasterDetails @Id');
 */
function tenantScopedRequest(pool, req) {
  const request = pool.request();
  request.input("__tenantId", sql.NVarChar(100), req.authUser.tenantId);

  const scoped = {
    input(...args) {
      request.input(...args);
      return scoped;
    },
    query(text) {
      return request.query(`EXEC sp_set_session_context @key=N'TenantId', @value=@__tenantId;\n${text}`);
    },
  };
  return scoped;
}

async function applyTenantContext(pool, tenantId) {
  await pool.request()
    .input("tenantId", sql.NVarChar, tenantId)
    .query("EXEC sp_set_session_context 'TenantId', @tenantId;");
}

/** 
 * Returns a SQL request object with Tenant context already applied
 */
async function tenantRequest(req) {
  const pool = await getPool();
  await applyTenantContext(pool, req.authUser.tenantId);
  return pool.request();
}

/**
 * Runs a raw SQL query with Tenant Context
 */
async function runTenantQuery(req, query) {
  const request = await tenantRequest(req);
  return request.query(query);
}

/**
 * Runs a stored procedure with Tenant Context and parameters
 */
async function runTenantProcedure(req, procedureName, params = {}) {
  const request = await tenantRequest(req);

  Object.keys(params).forEach(key => {
    const { type, value } = params[key];
    request.input(key, type, value);
  });

  return request.execute(procedureName);
}

module.exports = {
  tenantScopedRequest,
  tenantRequest,
  runTenantQuery,
  runTenantProcedure,
  setTenantContext
};
