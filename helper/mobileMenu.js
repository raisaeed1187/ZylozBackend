const sql = require("mssql");

/**
 * Adds ShowOnMobile (1/0) to every GetUserModulesMenus row, from the
 * user's rows in dbo.UserMobileMenu (see Frontend/sql/User_Mobile_Menu.sql).
 * No rows for the user = every menu gets 0 = the frontend shows the full menu.
 *
 * @param conn   ConnectionPool or Transaction the menus were read with
 * @param userId dbo.Users.ID2
 * @param rows   GetUserModulesMenus recordset (changed in place and returned)
 */
const attachMobileMenus = async (conn, userId, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  let ids = new Set();
  try {
    const result = await new sql.Request(conn)
      .input("UserID", sql.NVarChar(65), userId)
      .execute("UserMobileMenu_Get");
    ids = new Set(result.recordset.map((r) => String(r.TransactionId).toLowerCase()));
  } catch (err) {
    // Never block login because of this (e.g. SQL script not run yet): full menu.
    console.error("UserMobileMenu_Get failed:", err.message);
  }

  rows.forEach((row) => {
    row.ShowOnMobile = ids.has(String(row.TransactionId).toLowerCase()) ? 1 : 0;
  });
  return rows;
};

module.exports = { attachMobileMenus };
