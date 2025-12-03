const fs = require("fs");
const path = require("path");

function logSqlError(error, req, queryOrProc) {
  const logPath = path.join(__dirname, "sql_errors.log");

  const data = `
----------------------------------------
Time: ${new Date().toISOString()}
User: ${req.authUser?.userId || "unknown"}
Tenant: ${req.authUser?.tenantId || "unknown"}
Query/Procedure: ${queryOrProc}
Error Message: ${error.message}
----------------------------------------
`;

  fs.appendFileSync(logPath, data);
}

module.exports = { logSqlError };
