/**
 * One-off face enrollment health check (read-only — changes nothing).
 *
 * 1. Each employee's own photos should look like each other. A low score means
 *    one photo is bad (blurry, dark, side-on, or someone else) → re-enroll.
 * 2. Different employees should NOT look alike. A high score means those two
 *    can be confused at check-in → re-enroll both with clear photos.
 *
 * Usage (from the Backend folder, uses the DB settings in .env):
 *   node scripts/faceSimilarityScan.js <tenantId> [database=Allbiz] [pairAlert%=50]
 */

require("dotenv").config();
const sql = require("mssql");

const [tenantId, database = "Allbiz", alertArg = "50"] = process.argv.slice(2);
if (!tenantId) {
  console.error("Usage: node scripts/faceSimilarityScan.js <tenantId> [database] [pairAlert%]");
  process.exit(1);
}
const PAIR_ALERT = parseFloat(alertArg) / 100; // cross-employee similarity worth checking
const SELF_ALERT = 0.50;                       // own photos less alike than this → bad photo

function similarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const pct = (s) => `${(s * 100).toFixed(1)}%`;

(async () => {
  const pool = await sql.connect({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT, 10),
    database,
    options: { trustServerCertificate: true, encrypt: true, enableArithAbort: true },
  });

  // Tenant context is set in the same batch so it applies to this query.
  const rows = (await pool.request()
    .input("tenantId", sql.NVarChar, tenantId)
    .query(`
      EXEC sp_set_session_context @key=N'TenantId', @value=@tenantId;
      SELECT e.EmployeeId, e.Name, e.EmployeeCode, f.Embedding, f.QualityScore, f.CreatedAt
      FROM   AttendanceEmployees e
      JOIN   FaceEmbeddings f ON e.EmployeeId = f.EmployeeId
      WHERE  e.IsActive = 1 AND e.TenantId = @tenantId
      ORDER  BY e.EmployeeId, f.CreatedAt
    `)).recordset;

  const employees = new Map();
  for (const r of rows) {
    let emb;
    try { emb = JSON.parse(r.Embedding); } catch { continue; }
    if (!employees.has(r.EmployeeId)) {
      employees.set(r.EmployeeId, { name: r.Name, code: r.EmployeeCode, photos: [] });
    }
    employees.get(r.EmployeeId).photos.push({ emb, quality: r.QualityScore });
  }
  const list = [...employees.values()];
  console.log(`\nTenant ${tenantId}: ${list.length} enrolled employees, ${rows.length} photos\n`);

  // ── 1. Own photos consistency ─────────────────────────────────────────────
  console.log("── 1. Own photos (lowest similarity between an employee's own photos) ──");
  let selfIssues = 0;
  for (const e of list) {
    if (e.photos.length < 2) {
      console.log(`   ⚠ ${e.name} (${e.code}): only 1 photo — re-enroll with 3–5 photos`);
      selfIssues++;
      continue;
    }
    let worst = 1, worstPhoto = 0;
    for (let i = 0; i < e.photos.length; i++) {
      for (let j = i + 1; j < e.photos.length; j++) {
        const s = similarity(e.photos[i].emb, e.photos[j].emb);
        if (s < worst) { worst = s; worstPhoto = j + 1; }
      }
    }
    if (worst < SELF_ALERT) {
      console.log(`   ✗ ${e.name} (${e.code}): own photos only ${pct(worst)} alike (check photo #${worstPhoto}) — re-enroll`);
      selfIssues++;
    }
  }
  if (!selfIssues) console.log("   ✓ All employees' photos are consistent");

  // ── 2. Look-alike pairs across employees ─────────────────────────────────
  console.log(`\n── 2. Different employees that look alike (≥ ${pct(PAIR_ALERT)}) ──`);
  const pairs = [];
  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) {
      let best = -1;
      for (const pa of list[a].photos) {
        for (const pb of list[b].photos) {
          const s = similarity(pa.emb, pb.emb);
          if (s > best) best = s;
        }
      }
      if (best >= PAIR_ALERT) pairs.push({ a: list[a], b: list[b], s: best });
    }
  }
  pairs.sort((x, y) => y.s - x.s);
  for (const p of pairs) {
    const level = p.s >= 0.62 ? "✗ HIGH" : "⚠ check";
    console.log(`   ${level}  ${pct(p.s)}  ${p.a.name} (${p.a.code})  ↔  ${p.b.name} (${p.b.code})`);
  }
  if (!pairs.length) console.log("   ✓ No look-alike pairs");

  console.log("\nHIGH (≥ 62%) = can be matched as each other at check-in → re-enroll both with clear photos.\n");
  await pool.close();
})().catch((err) => {
  console.error("Scan failed:", err.message);
  process.exit(1);
});
