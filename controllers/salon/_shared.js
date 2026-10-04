// Shared plumbing for the Salon module controllers (barber commission & billing).
// SQL objects: Frontend/sql/Salon/*.sql (all usp_Salon_* / fn_Salon_* in Allbiz).
const sql = require("mssql");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config();
const store = require("../../store");
const { setCurrentDatabase, setCurrentUser } = require("../../constents").actions;
const { setTenantContext } = require("../../helper/db/sqlTenant");

// Shop-local time zone: bill dates, "today", month keys and day closing are all
// in salon time, whatever time zone the API server runs in.
const SALON_TZ = process.env.SALON_TZ || "Asia/Dubai";

// The barber app is one global URL (/salon-barber) with no tenant in it, so its
// requests run against the database that holds the Salon tables.
const SALON_DATABASE = process.env.SALON_DATABASE || "Allbiz";

// Barber tokens use their OWN secret so they can never pass authenticateToken
// (middleware.js) and reach any other module's endpoints.
const BARBER_SECRET = `${process.env.SECRET_KEY}::salon-barber`;
const BARBER_TOKEN_TTL = "30d";

// Screens that only the owner role is given (02_Salon_Menu_OneTimeSetup.sql).
// A user who can open the commission rules is treated as the salon owner.
const OWNER_SCREEN = "salon/commission-rules";

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// ───────────────────────────────────────────── DB

async function getTenantPool(req) {
    store.dispatch(setCurrentDatabase(req.authUser.database));
    store.dispatch(setCurrentUser(req.authUser));
    const config = store.getState().constents.config;
    const pool = await sql.connect(config);
    await setTenantContext(pool, req);
    return pool;
}

async function getSalonPool() {
    store.dispatch(setCurrentDatabase(SALON_DATABASE));
    const config = store.getState().constents.config;
    return sql.connect(config);
}

// ───────────────────────────────────────────── shop-local time

function shopNow(date = new Date()) {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
            timeZone: SALON_TZ,
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
        }).formatToParts(date).map((p) => [p.type, p.value]),
    );
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    return {
        today,                                                        // 'YYYY-MM-DD'
        now: `${today}T${parts.hour}:${parts.minute}:${parts.second}`, // ISO without zone (SQL-safe)
        monthKey: today.slice(0, 7),                                  // 'YYYY-MM'
    };
}

const isDateKey = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonthKey = (v) => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);

// Local timestamp from the device ('2026-10-03T13:30:00', no zone) -> SQL-safe ISO string.
function toSqlDateTime(v) {
    if (typeof v !== "string") return null;
    const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?/);
    return m ? `${m[1]}T${m[2]}${m[3] || ":00"}` : null;
}

const shiftMonth = (monthKey, delta) => {
    const [y, m] = monthKey.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// mssql reads DATETIME as if it were UTC (useUTC default). The values are shop-local,
// so send them back as zone-less strings the browser parses as local time.
const pad = (n) => String(n).padStart(2, "0");
function dateOut(value, isDateOnly) {
    if (!(value instanceof Date)) return value;
    const d = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
    return isDateOnly ? d : `${d}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
}

function rows(recordset) {
    if (!recordset) return [];
    const dateCols = Object.entries(recordset.columns || {})
        .filter(([, c]) => c.type === sql.Date)
        .map(([name]) => name);
    return recordset.map((r) => {
        const out = {};
        for (const [k, v] of Object.entries(r)) out[k] = dateOut(v, dateCols.includes(k));
        return out;
    });
}

const json = (v, fallback = []) => {
    if (v == null || v === "") return fallback;
    try { return JSON.parse(v); } catch { return fallback; }
};
const num = (v) => (v == null ? 0 : Number(v));

// ───────────────────────────────────────────── access

// Per-user modules + organizations + branches, cached briefly (one lookup per
// user per 5 minutes instead of two extra procedure calls on every request).
const accessCache = new Map();
const ACCESS_TTL_MS = 5 * 60 * 1000;

async function loadAccess(pool, req) {
    const userId = req.authUser.ID2 || req.authUser.id;
    const key = `${req.authUser.tenantId}|${userId}`;
    const hit = accessCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;

    const [modules, info] = await Promise.all([
        pool.request().input("UserID", sql.NVarChar, userId).execute("GetUserModulesMenus"),
        pool.request().input("UserID", sql.NVarChar, userId).execute("UsersAccessInfo_Get"),
    ]);
    const value = {
        modules: modules.recordset || [],
        organizations: (info.recordsets && info.recordsets[2]) || [],
        branches: (info.recordsets && info.recordsets[3]) || [],
    };
    accessCache.set(key, { value, expires: Date.now() + ACCESS_TTL_MS });
    return value;
}

const norm = (u) => String(u || "").replace(/^\/|\/$/g, "").toLowerCase();

function screenAccess(access, screen) {
    const m = access.modules.find((x) => norm(x.MenuUrl) === norm(screen));
    return {
        view: !!(m && (m.ViewAccess || m.FullAccess)),
        add: !!(m && (m.AddAccess || m.FullAccess)),
        edit: !!(m && (m.EditAccess || m.FullAccess)),
        delete: !!(m && (m.DeleteAccess || m.FullAccess)),
    };
}

/**
 * Resolves the caller's salon scope and role, and enforces screen access.
 *   screen     — Transections.Url the endpoint belongs to (e.g. 'salon/bills'); null = any salon screen
 *   ownerOnly  — only the owner (tenant admin or holder of the commission-rules screen)
 * Returns { pool, tenantId, organizationId, branchId, userName, isOwner, today, now, monthKey }.
 */
async function salonContext(req, { screen = null, ownerOnly = false } = {}) {
    if (!req.authUser || !req.authUser.tenantId) throw new HttpError(401, "Please sign in again.");

    const pool = await getTenantPool(req);
    const access = await loadAccess(pool, req);
    const isAdmin = !!req.authUser.isAdmin;
    const isOwner = isAdmin || screenAccess(access, OWNER_SCREEN).view;

    if (ownerOnly && !isOwner) throw new HttpError(403, "Owner access only.");
    if (screen && !isAdmin && !screenAccess(access, screen).view) {
        throw new HttpError(403, "You don't have access to this salon screen.");
    }
    if (!screen && !isAdmin && !access.modules.some((m) => norm(m.MenuUrl).startsWith("salon/"))) {
        throw new HttpError(403, "You don't have access to the salon module.");
    }

    const organizationId = String(req.body.organizationId || "");
    const branchId = String(req.body.branchId || "");
    if (!isAdmin) {
        if (organizationId && !access.organizations.some((o) => String(o.ID2) === organizationId)) {
            throw new HttpError(403, "You don't have access to this organization.");
        }
        if (branchId && !access.branches.some((b) => String(b.ID2) === branchId)) {
            throw new HttpError(403, "You don't have access to this branch.");
        }
    }

    return {
        pool,
        tenantId: req.authUser.tenantId,
        organizationId,
        branchId,
        userName: req.authUser.username || req.authUser.userName || req.authUser.email || "user",
        isOwner,
        ...shopNow(),
    };
}

// request() pre-filled with the scope every Salon procedure takes.
function scoped(ctx) {
    return ctx.pool.request()
        .input("TenantID", sql.NVarChar(65), ctx.tenantId)
        .input("OrganizationID", sql.NVarChar(65), ctx.organizationId)
        .input("BranchId", sql.NVarChar(65), ctx.branchId);
}

// Wraps a handler: JSON errors, SQL RAISERROR messages passed to the app as-is.
const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        const status = error.status || 400;
        if (status >= 500 || !error.status) console.error("[salon]", req.path, error.message);
        res.status(status).json({ message: error.message, data: null });
    }
};

const ok = (res, data, message = "OK") => res.status(200).json({ message, data });

// ───────────────────────────────────────────── barber auth

function signBarberToken(payload) {
    return jwt.sign({ kind: "salon-barber", ...payload }, BARBER_SECRET, { expiresIn: BARBER_TOKEN_TTL });
}

function authenticateBarber(req, res, next) {
    const header = req.headers["authorization"];
    const token = header && header.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Please log in.", data: null });
    try {
        const decoded = jwt.verify(token, BARBER_SECRET);
        if (decoded.kind !== "salon-barber" || !decoded.staffId || !decoded.tenantId) throw new Error("bad token");
        req.barber = decoded;
        return next();
    } catch {
        return res.status(401).json({ message: "Session expired. Please log in again.", data: null });
    }
}

module.exports = {
    sql,
    bcrypt,
    HttpError,
    SALON_TZ,
    shopNow,
    isDateKey,
    isMonthKey,
    toSqlDateTime,
    shiftMonth,
    rows,
    json,
    num,
    salonContext,
    scoped,
    handle,
    ok,
    getSalonPool,
    signBarberToken,
    authenticateBarber,
};
