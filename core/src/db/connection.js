import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";
import { runMigrations } from "./migrations.js";
import { scheduleDbUpload } from "../services/cloud-backup.js";

let db;

const WRITE_KEYWORDS = /^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|BEGIN|COMMIT|PRAGMA)/i;

function wrapDb(realDb) {
  const originalExec = realDb.exec.bind(realDb);
  realDb.exec = function (sql) {
    const result = originalExec(sql);
    if (WRITE_KEYWORDS.test(sql)) scheduleDbUpload();
    return result;
  };

  const originalPrepare = realDb.prepare.bind(realDb);
  realDb.prepare = function (sql) {
    const stmt = originalPrepare(sql);
    if (WRITE_KEYWORDS.test(sql)) {
      const originalRun = stmt.run.bind(stmt);
      stmt.run = function (...args) {
        const result = originalRun(...args);
        scheduleDbUpload();
        return result;
      };
    }
    return stmt;
  };

  return realDb;
}

export function getDb() {
  if (!db) {
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    db = new DatabaseSync(config.dbPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
    db = wrapDb(db);
  }

  return db;
}
