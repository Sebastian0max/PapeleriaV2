import { buildApp } from "./app.js";
import { config } from "./config.js";
import { getDb } from "./db/connection.js";
import { purgeOldTrash } from "./services/products-service.js";

const isPostgres = !!process.env.SUPABASE_DATABASE_URL;

if (isPostgres) {
  console.log("[startup] Postgres mode.");
  try {
    const { runMigrationIfNeeded } = await import("./db/postgres-migrate.js");
    await runMigrationIfNeeded();
    console.log("[startup] Postgres schema & seed complete.");
  } catch (err) {
    console.error("[startup] Postgres migration failed:", err);
  }
} else {
  console.log("[startup] SQLite mode.");
  try {
    const { downloadDb, startPeriodicBackup, flushOnShutdown } = await import("./services/cloud-backup.js");
    await downloadDb();
  } catch (err) {
    console.error("[startup] cloud-backup init failed:", err);
  }
  try {
    getDb();
  } catch (err) {
    console.error("[startup] SQLite init failed:", err);
  }
  try {
    const purged = purgeOldTrash(7);
    console.log(`[startup] Papelera: ${purged.purged} productos purgados.`);
  } catch (err) {
    console.error("[startup] purgeOldTrash failed:", err);
  }
  try {
    const { startPeriodicBackup } = await import("./services/cloud-backup.js");
    startPeriodicBackup();
  } catch (err) {
    console.error("[startup] periodic backup init failed:", err);
  }
  setInterval(async () => {
    try {
      const h = new Date().getHours();
      if (h === 3) {
        const { createDailyBackup } = await import("./services/backup-service.js");
        await createDailyBackup();
      }
    } catch (err) {
      console.error("[scheduler] createDailyBackup failed:", err);
    }
  }, 3600_000);
  setTimeout(async () => {
    try {
      const { createDailyBackup } = await import("./services/backup-service.js");
      await createDailyBackup();
    } catch (err) {
      console.error("[startup] initial createDailyBackup failed:", err);
    }
  }, 60_000);
  process.on("SIGTERM", async () => {
    try {
      console.log("[server] SIGTERM received, flushing DB...");
      const { flushOnShutdown } = await import("./services/cloud-backup.js");
      await flushOnShutdown();
    } catch (err) {
      console.error("[server] SIGTERM flush failed:", err);
    }
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    try {
      console.log("[server] SIGINT received, flushing DB...");
      const { flushOnShutdown } = await import("./services/cloud-backup.js");
      await flushOnShutdown();
    } catch (err) {
      console.error("[server] SIGINT flush failed:", err);
    }
    process.exit(0);
  });
}

const app = buildApp();
await app.listen({ host: config.host, port: config.port });
