import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const BUCKET = "papeleria-backups";
const RETENTION_DAYS = 30;

function supabaseHeaders() {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
}

async function ensureBucket() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers: supabaseHeaders() });
  if (res.ok) return;
  const create = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...supabaseHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false })
  });
  if (!create.ok) console.error("[backup] Could not create bucket:", await create.text());
}

export async function createDailyBackup() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("[backup] No Supabase config. Skipping daily backup.");
    return;
  }
  await ensureBucket();
  try { getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch (_) {}
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupName = `papeleria-${timestamp}.db`;
  const bytes = fs.readFileSync(config.dbPath);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${backupName}`, {
    method: "POST",
    headers: { ...supabaseHeaders(), "Content-Type": "application/octet-stream", "x-upsert": "true" },
    body: bytes
  });
  if (res.ok) {
    console.log(`[backup] Daily backup uploaded: ${backupName} (${bytes.length} bytes)`);
    await cleanOldBackups();
  } else {
    console.error("[backup] Upload failed:", res.status, await res.text());
  }
}

async function cleanOldBackups() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 864e5).toISOString();
  const list = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, { headers: supabaseHeaders() });
  if (!list.ok) return;
  const files = await list.json();
  const old = files.filter(f => f.created_at < cutoff);
  if (old.length === 0) return;
  const oldIds = old.map(f => `${BUCKET}/${f.name}`);
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: { ...supabaseHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: oldIds })
  });
  console.log(`[backup] Cleaned ${old.length} old backup(s) (older than ${RETENTION_DAYS} days).`);
}
