const sql = require("mssql");

async function auditLog(reqOrTransaction, { 
    tableName,
    recordId,
    actionType,
    oldData = null,
    newData = null,
    userId
}) {
    const request =
            reqOrTransaction instanceof sql.Transaction
                ? new sql.Request(reqOrTransaction)
                : reqOrTransaction.request ? reqOrTransaction.request() : new sql.Request(reqOrTransaction);
    
    await request 
        .input("TableName", sql.NVarChar, tableName)
        .input("RecordId", sql.NVarChar, recordId)
        .input("ActionType", sql.NVarChar, actionType)
        .input("OldData", sql.NVarChar(sql.MAX), oldData ? JSON.stringify(oldData) : null)
        .input("NewData", sql.NVarChar(sql.MAX), newData ? JSON.stringify(newData) : null)
        .input("UserId", sql.NVarChar, userId)
        .execute("AuditLog_Save");
}

module.exports = auditLog;
