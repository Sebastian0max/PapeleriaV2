import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const BUCKET = "papeleria";
const DB_OBJECT = "papeleria.db";

let syncEnabled = false;
let uploadTimer = null;
let uploading = false;
let pendingUpload = false;
let periodicTimer = null;

const PERIODIC_INTERVAL = 15_000;

function supabaseHeaders() {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
}

function storageUrl(objectPath) {
  return `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`;
}

async function ensureBucket() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers: supabaseHeaders() });
  if (res.ok) return;
  const create = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...supabaseHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false })
  });
  if (!create.ok) { const text = await create.text(); console.error("[cloud-backup] Could not create bucket:", text); }
}

export async function downloadDb() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("[cloud-backup] No SUPABASE_URL / SUPABASE_SERVICE_KEY configured. Running with local DB only.");
    return;
  }
  syncEnabled = true;
  console.log("[cloud-backup] Cloud sync enabled.");
  await ensureBucket();
  const res = await fetch(storageUrl(DB_OBJECT), { headers: supabaseHeaders() });
  if (res.ok) {
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
    fs.writeFileSync(config.dbPath, buffer);
    console.log(`[cloud-backup] Downloaded DB (${buffer.length} bytes) -> ${config.dbPath}`);
  } else if (res.status === 404 || res.status === 400) {
    console.log("[cloud-backup] No remote DB found. A fresh database will be created.");
  } else { console.warn("[cloud-backup] Failed to download DB:", res.status, await res.text()); }
}

async function uploadDb() {
  if (!syncEnabled) return;
  if (!fs.existsSync(config.dbPath)) return;
  if (uploading) { pendingUpload = true; return; }
  uploading = true;
  try {
    try { getDb().exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch (_) {}
    const bytes = fs.readFileSync(config.dbPath);
    const res = await fetch(storageUrl(DB_OBJECT), {
      method: "POST",
      headers: { ...supabaseHeaders(), "Content-Type": "application/octet-stream", "x-upsert": "true" },
      body: bytes
    });
    if (!res.ok) { console.error("[cloud-backup] DB upload failed:", res.status, await res.text()); }
    else { console.log(`[cloud-backup] DB uploaded (${bytes.length} bytes)`); }
  } catch (err) { console.error("[cloud-backup] DB upload error:", err.message); }
  finally { uploading = false; if (pendingUpload) { pendingUpload = false; uploadDb(); } }
}

export function scheduleDbUpload() { if (!syncEnabled) return; uploadDb(); }

export function startPeriodicBackup() {
  if (!syncEnabled) return;
  if (periodicTimer) clearInterval(periodicTimer);
  periodicTimer = setInterval(uploadDb, PERIODIC_INTERVAL);
  console.log(`[cloud-backup] Periodic backup every ${PERIODIC_INTERVAL / 1000}s started.`);
}

export async function flushOnShutdown() {
  if (!syncEnabled) return;
  if (periodicTimer) clearInterval(periodicTimer);
  if (uploading) {
    await new Promise(resolve => { const check = () => { if (!uploading && !pendingUpload) resolve(); else setTimeout(check, 100); }; check(); });
  }
  if (!uploading && fs.existsSync(config.dbPath)) { await uploadDb(); }
  console.log("[cloud-backup] Shutdown flush complete.");
}


