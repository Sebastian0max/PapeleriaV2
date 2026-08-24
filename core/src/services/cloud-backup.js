import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const BUCKET = "papeleria";
const DB_OBJECT = "papeleria.db";

let syncEnabled = false;
let uploading = false;
let pendingUpload = false;
let uploadTimer = null;
let lastUploadAt = 0;
let lastUploadedSize = -1;
let lastUploadedMtime = 0;

// HARD LIMITS to bound outbound bandwidth. The old 15s periodic upload
// re-sent the whole DB file ~2880 times/month, which caused the huge
// Render bandwidth bill. Now uploads are debounced, capped at one per
// minute, and skipped entirely when the DB file did not change.
const UPLOAD_DEBOUNCE_MS = 10_000;
const MIN_UPLOAD_INTERVAL_MS = 60_000;
const FLUSH_MAX_WAIT_MS = 15_000;

function supabaseHeaders() {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
}

function storageUrl(objectPath) {
  return `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${objectPath}`;
}

function publicUrl(objectPath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

async function ensureBucket() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers: supabaseHeaders() });
  if (res.ok) return;
  const create = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...supabaseHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true })
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
    const st = fs.statSync(config.dbPath);
    lastUploadedSize = st.size;
    lastUploadedMtime = st.mtimeMs;
    lastUploadAt = Date.now();
    console.log(`[cloud-backup] Downloaded DB (${buffer.length} bytes) -> ${config.dbPath}`);
  } else if (res.status === 404 || res.status === 400) {
    console.log("[cloud-backup] No remote DB found. A fresh database will be created.");
  } else { console.warn("[cloud-backup] Failed to download DB:", res.status, await res.text()); }
}

function dbChangedSinceLastUpload() {
  if (!fs.existsSync(config.dbPath)) return false;
  const st = fs.statSync(config.dbPath);
  return st.size !== lastUploadedSize || st.mtimeMs !== lastUploadedMtime;
}

async function uploadDb() {
  if (!syncEnabled) return;
  if (!fs.existsSync(config.dbPath)) return;
  if (uploading) { pendingUpload = true; return; }

  // Skip the network round-trip when the DB is unchanged since the last upload.
  if (lastUploadAt > 0 && !dbChangedSinceLastUpload()) return;

  // Hard cap: never upload more than once per minute, no matter how many
  // writes happened. Delay the upload to respect the cap.
  const wait = lastUploadAt + MIN_UPLOAD_INTERVAL_MS - Date.now();
  if (wait > 0) {
    if (uploadTimer) clearTimeout(uploadTimer);
    uploadTimer = setTimeout(() => { uploadTimer = null; uploadDb(); }, wait);
    return;
  }

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
    else {
      console.log(`[cloud-backup] DB uploaded (${bytes.length} bytes)`);
      const st = fs.statSync(config.dbPath);
      lastUploadedSize = st.size;
      lastUploadedMtime = st.mtimeMs;
      lastUploadAt = Date.now();
    }
  } catch (err) { console.error("[cloud-backup] DB upload error:", err.message); }
  finally { uploading = false; if (pendingUpload) { pendingUpload = false; uploadDb(); } }
}

/** Debounced upload: coalesces bursts of writes into a single upload. */
export function scheduleDbUpload() {
  if (!syncEnabled) return;
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => { uploadTimer = null; uploadDb(); }, UPLOAD_DEBOUNCE_MS);
}

export async function flushOnShutdown() {
  if (!syncEnabled) return;
  if (uploadTimer) { clearTimeout(uploadTimer); uploadTimer = null; }
  const deadline = Date.now() + FLUSH_MAX_WAIT_MS;
  if (uploading) {
    await new Promise(resolve => {
      const check = () => {
        if ((!uploading && !pendingUpload) || Date.now() > deadline) resolve();
        else setTimeout(check, 100);
      };
      check();
    });
  }
  if (!uploading && fs.existsSync(config.dbPath) && dbChangedSinceLastUpload()) { await uploadDb(); }
  console.log("[cloud-backup] Shutdown flush complete.");
}

export async function uploadImage(fileName, buffer, mimeType) {
  if (!syncEnabled) return null;
  const objectPath = `productos/${fileName}`;
  const res = await fetch(storageUrl(objectPath), {
    method: "POST",
    headers: { ...supabaseHeaders(), "Content-Type": mimeType, "x-upsert": "true" },
    body: buffer
  });
  if (!res.ok) { console.error("[cloud-backup] Image upload failed:", res.status, await res.text()); return null; }
  return publicUrl(objectPath);
}

export function isCloudEnabled() { return syncEnabled; }
