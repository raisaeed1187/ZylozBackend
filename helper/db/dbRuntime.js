/**
 * Database runtime fixes, loaded once at startup (server.js) before any query.
 *
 * 1. One connection pool PER DATABASE.
 *    mssql's sql.connect(config) keeps a single global pool: the first call
 *    after a restart decided the database for every later request, whatever
 *    config.database said. sql.connect(config) now returns (and caches) the
 *    pool of config.database, so each user gets the database from his login.
 *
 * 2. Tenant session context on the SAME connection as every query.
 *    Row-level security (TenantSecurityPolicy) reads SESSION_CONTEXT('TenantId').
 *    setTenantContext(pool, req) set it on one pooled connection, but the next
 *    pool.request() can run on another connection, which has no tenant or the
 *    tenant of an earlier user. Every query / execute of an authenticated
 *    request now sets the tenant in the same batch. The tenant comes from the
 *    logged-in user (AsyncLocalStorage, set in middleware.js).
 *
 * Controllers do not change. Switch off with DB_TENANT_PER_QUERY=off in .env
 * (per-database pools stay on).
 */
require("dotenv").config();
const { AsyncLocalStorage } = require("async_hooks");
const sql = require("mssql");

const requestContext = new AsyncLocalStorage();

const TENANT_PARAM = "__ctxTenantId";
const RETURN_PARAM = "__ctxReturnValue";
const SET_CONTEXT_SQL = `EXEC sp_set_session_context @key=N'TenantId', @value=@${TENANT_PARAM};`;
const tenantPerQuery = (process.env.DB_TENANT_PER_QUERY || "on").toLowerCase() !== "off";

let installed = false;

/* ---------- 1. one pool per database ---------- */

const pools = new Map(); // key -> Promise<ConnectionPool>

function poolKey(config) {
  return [config.server, config.port, config.database, config.user].join("|");
}

function getPool(config) {
  const key = poolKey(config);
  let pending = pools.get(key);
  if (!pending) {
    const pool = new sql.ConnectionPool(config);
    pool.on("error", (err) => console.error(`[db] pool error (${config.database}):`, err.message));
    pending = pool.connect().catch((err) => {
      pools.delete(key); // retry on the next request
      throw err;
    });
    pools.set(key, pending);
  }
  return pending;
}

/* ---------- 2. tenant on every query ---------- */

function currentTenantId() {
  const ctx = requestContext.getStore();
  return ctx && ctx.tenantId ? String(ctx.tenantId) : null;
}

function addTenantParam(request, tenantId) {
  if (!Object.prototype.hasOwnProperty.call(request.parameters, TENANT_PARAM)) {
    request.input(TENANT_PARAM, sql.NVarChar(100), tenantId);
  }
}

// procedure names come from our code; anything unusual runs the original way
const SAFE_PROC_NAME = /^[\w.\[\]]+$/;

function install() {
  if (installed) return;
  installed = true;

  const originalConnect = sql.connect;
  sql.connect = function connect(config, callback) {
    if (!config || typeof config !== "object" || !config.database) {
      return originalConnect.apply(sql, arguments);
    }
    const pending = getPool(config);
    if (typeof callback === "function") {
      pending.then((pool) => callback(null, pool), callback);
      return undefined;
    }
    return pending;
  };

  if (!tenantPerQuery) return;

  const proto = sql.Request.prototype;
  const originalQuery = proto._query;
  const originalExecute = proto._execute;

  // query(): prepend the tenant to the batch
  proto._query = function _query(command, callback) {
    const tenantId = currentTenantId();
    if (!tenantId || typeof command !== "string" || /sp_set_session_context/i.test(command)) {
      return originalQuery.call(this, command, callback);
    }
    addTenantParam(this, tenantId);
    return originalQuery.call(this, `${SET_CONTEXT_SQL}\n${command}`, callback);
  };

  // execute(): run the procedure in a batch after setting the tenant
  proto._execute = function _execute(procedure, callback) {
    const tenantId = currentTenantId();
    if (!tenantId || typeof procedure !== "string" || !SAFE_PROC_NAME.test(procedure)) {
      return originalExecute.call(this, procedure, callback);
    }

    const args = Object.values(this.parameters)
      .filter((p) => p.name !== TENANT_PARAM && p.name !== RETURN_PARAM)
      .map((p) => `@${p.name} = @${p.name}${p.io === 2 ? " OUTPUT" : ""}`)
      .join(", ");

    addTenantParam(this, tenantId);
    if (!Object.prototype.hasOwnProperty.call(this.parameters, RETURN_PARAM)) {
      this.output(RETURN_PARAM, sql.Int);
    }

    const batch = `${SET_CONTEXT_SQL}\nEXEC @${RETURN_PARAM} = ${procedure}${args ? " " + args : ""};`;

    return originalQuery.call(this, batch, (err, recordsets, output, rowsAffected, columns) => {
      if (err) return callback(err);
      const out = Object.assign({}, output);
      const returnValue = out[RETURN_PARAM] == null ? 0 : out[RETURN_PARAM];
      delete out[RETURN_PARAM];
      callback(null, recordsets, out, returnValue, rowsAffected, columns);
    });
  };
}

/** Express: run the rest of the request with the user's tenant */
function runWithTenant(authUser, next) {
  return requestContext.run({ tenantId: authUser && authUser.tenantId }, next);
}

module.exports = { install, runWithTenant, requestContext, getPool };
