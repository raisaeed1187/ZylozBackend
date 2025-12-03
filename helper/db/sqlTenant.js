const sql = require("mssql");
const store = require("../../store");

async function getPool() {
  const config = store.getState().constents.config;
  return sql.connect(config);
}
 
const setTenantContext = async (reqOrTransaction, req) => {
    const request =
        reqOrTransaction instanceof sql.Transaction
            ? new sql.Request(reqOrTransaction)
            : reqOrTransaction.request ? reqOrTransaction.request() : new sql.Request(reqOrTransaction);

    const tenantId = req.authUser.tenantId;
    return request
        .input("tenantId", sql.NVarChar, tenantId)
        .query(`EXEC sp_set_session_context @key=N'TenantId', @value=@tenantId`);
};


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
  tenantRequest,
  runTenantQuery,
  runTenantProcedure,
  setTenantContext
};
