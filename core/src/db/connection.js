import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";
import { runMigrations } from "./migrations.js";

const isPostgres = !!process.env.SUPABASE_DATABASE_URL;
let db;

if (isPostgres) {
  console.log("[db] Postgres mode — use getPool()/getClient()");
}

// SQLite write-detection keywords
const WRITE_KEYWORDS = /^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|BEGIN|COMMIT|PRAGMA)/i;

function wrapDb(realDb) {
  const originalExec = realDb.exec.bind(realDb);
  realDb.exec = function (sql) {
    const result = originalExec(sql);
    if (WRITE_KEYWORDS.test(sql)) lazyScheduleUpload();
    return result;
  };

  const originalPrepare = realDb.prepare.bind(realDb);
  realDb.prepare = function (sql) {
    const stmt = originalPrepare(sql);
    if (WRITE_KEYWORDS.test(sql)) {
      const originalRun = stmt.run.bind(stmt);
      stmt.run = function (...args) {
        const result = originalRun(...args);
        lazyScheduleUpload();
        return result;
      };
    }
    return stmt;
  };

  return realDb;
}

function lazyScheduleUpload() {
  import("../services/cloud-backup.js")
    .then((m) => m.scheduleDbUpload())
    .catch(() => {});
}

/** Returns the SQLite database instance (sync). Throws in Postgres mode. */
export function getDb() {
  if (isPostgres) {
    throw new Error(
      "getDb() is not available in Postgres mode. Use getPool()/getClient() from postgres-connection.js."
    );
  }
  if (!db) {
    mkdirSync(dirname(config.dbPath), { recursive: true });
    db = new DatabaseSync(config.dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    db = wrapDb(db);
  }
  return db;
}

// --- Postgres exports (error early if not configured) ---

/** @returns {import('pg').Pool} */
export function getPool() {
  if (!isPostgres) throw new Error("Postgres not configured. Set SUPABASE_DATABASE_URL.");
  return import("./postgres-connection.js").then((m) => m.getPool());
}

/** @returns {Promise<import('pg').PoolClient>} */
export function getClient() {
  if (!isPostgres) throw new Error("Postgres not configured. Set SUPABASE_DATABASE_URL.");
  return import("./postgres-connection.js").then((m) => m.getClient());
}

export function query(text, params) {
  if (!isPostgres) throw new Error("Postgres not configured. Set SUPABASE_DATABASE_URL.");
  return import("./postgres-connection.js").then((m) => m.query(text, params));
}

export async function closePool() {
  if (isPostgres) {
    const m = await import("./postgres-connection.js");
    await m.closePool();
  }
}
