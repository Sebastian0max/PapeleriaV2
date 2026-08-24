import { app, BrowserWindow } from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const userData = app.getPath("userData");
try { mkdirSync(userData, { recursive: true }); } catch (_) {}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { appendFileSync(join(userData, "desktop.log"), line); } catch (_) {}
  console.log(msg);
}

function loadBuildConfig() {
  const p = join(__dirname, "build-config.json");
  if (existsSync(p)) {
    try { return JSON.parse(readFileSync(p, "utf8")); } catch (_) {}
  }
  return {};
}

const cfg = loadBuildConfig();
if (cfg.SUPABASE_DATABASE_URL) process.env.SUPABASE_DATABASE_URL = cfg.SUPABASE_DATABASE_URL;
if (cfg.JWT_SECRET) process.env.JWT_SECRET = cfg.JWT_SECRET;
process.env.PORT = process.env.PORT || "4000";
process.env.PG_CONNECT_TIMEOUT = process.env.PG_CONNECT_TIMEOUT || "30000";
process.env.PG_IDLE_TIMEOUT = process.env.PG_IDLE_TIMEOUT || "30000";

let server = null;
let win = null;

function createWindow() {
  if (win && !win.isDestroyed()) { win.focus(); return; }

  win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  const devUrl = process.env.FRONTEND_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    const html = join(__dirname, "frontend", "dist", "index.html");
    if (existsSync(html)) {
      win.loadFile(html);
    } else {
      win.loadURL(
        "data:text/html,<h1>Frontend no encontrado</h1>" +
        "<p>Compila el frontend primero: <code>npm run build -w frontend</code></p>"
      );
    }
  }

  win.webContents.on("console-message", (_e, _level, msg) => {
    log("[renderer] " + msg);
  });
  win.once("ready-to-show", () => win.show());
  win.on("closed", () => { win = null; });
}

app.whenReady().then(async () => {
  log("[desktop] Starting...");
  let startupErr = null;

  try {
    log("[desktop] Loading backend modules...");
    const { buildApp } = await import(pathToFileURL(join(__dirname, "core", "src", "app.js")).href);
    const isPostgres = !!process.env.SUPABASE_DATABASE_URL;

    if (isPostgres) {
      log("[desktop] Postgres mode, connecting to DB...");
      const { runMigrationIfNeeded } = await import(pathToFileURL(join(__dirname, "core", "src", "db", "postgres-migrate.js")).href);
      let lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          log("[desktop] DB connection attempt " + attempt + "/3...");
          await runMigrationIfNeeded();
          log("[desktop] Migration completed successfully");
          break;
        } catch (dbErr) {
          lastErr = dbErr;
          log("[desktop] DB attempt " + attempt + " failed: " + dbErr.message);
          if (attempt < 3) {
            log("[desktop] Retrying in 3 seconds...");
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      }
      if (lastErr) throw lastErr;
    } else {
      process.env.PAPELERIA_DB = join(userData, "papeleria.db");
      process.env.PAPELERIA_UPLOADS = join(userData, "uploads");
      const { getDb } = await import(pathToFileURL(join(__dirname, "core", "src", "db", "connection.js")).href);
      getDb();
    }

    server = buildApp();
    server.addHook("onError", async (request, reply, error) => {
      log("[desktop] Server error: " + error.message);
    });
    await server.listen({ host: "127.0.0.1", port: Number(process.env.PORT) });
    log("[desktop] API running on port " + process.env.PORT);
  } catch (err) {
    startupErr = err;
    log("[desktop] Startup error: " + (err && err.stack ? err.stack : String(err)));
  }

  createWindow();
  if (startupErr && win && !win.isDestroyed()) {
    win.loadURL(
      "data:text/html,<h1>Error al iniciar el backend</h1>" +
      "<pre>" + String(startupErr).replace(/</g, "&lt;") + "</pre>"
    );
  }
});

app.on("window-all-closed", async () => {
  try { if (server) await server.close(); } catch (_) {}
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => { if (!win) createWindow(); });
