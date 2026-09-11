import { buildApp } from "./app.js";
import { config } from "./config.js";
import { getDb } from "./db/connection.js";
import { purgeOldTrash } from "./services/products-service.js";
import { purgeOldCanceled } from "./services/transactions-service.js";

const isPostgres = !!process.env.SUPABASE_DATABASE_URL;

if (isPostgres) {
  console.log("[startup] Postgres mode.");
  const { runMigrationIfNeeded } = await import("./db/postgres-migrate.js");
  await runMigrationIfNeeded();
  console.log("[startup] Postgres schema & seed complete.");
} else {
  console.log("[startup] SQLite mode.");
  try {
    const purged = purgeOldTrash(7);
    console.log(`[startup] Papelera: ${purged.purged} productos purgados.`);
  } catch (err) {
    console.error(`[startup] Error purgando papelera: ${err.message}`);
  }
  try {
    const purgedCanceled = purgeOldCanceled(7);
    console.log(`[startup] Canceladas: ${purgedCanceled.purged} transacciones purgadas.`);
  } catch (err) {
    console.error(`[startup] Error purgando canceladas: ${err.message}`);
  }
  const { startPeriodicBackup, flushOnShutdown } = await import("./services/cloud-backup.js");
  startPeriodicBackup();
  setInterval(async () => {
    const h = new Date().getHours();
    if (h === 3) {
      const { createDailyBackup } = await import("./services/backup-service.js");
      await createDailyBackup();
    }
  }, 3600_000);
  setTimeout(async () => {
    const { createDailyBackup } = await import("./services/backup-service.js");
    await createDailyBackup();
  }, 60_000);
  process.on("SIGTERM", async () => {
    console.log("[server] SIGTERM received, flushing DB...");
    await flushOnShutdown();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    console.log("[server] SIGINT received, flushing DB...");
    await flushOnShutdown();
    process.exit(0);
  });
}

const app = buildApp();
await app.listen({ host: config.host, port: config.port });
console.log(`[server] Listening on ${config.host}:${config.port}`);

// Descargar DB de Supabase en segundo plano (no bloquea el arranque)
if (!isPostgres) {
  const { downloadDb, startPeriodicBackup } = await import("./services/cloud-backup.js");
  downloadDb()
    .catch((err) => console.error("[startup] DB download error:", err.message))
    .finally(() => startPeriodicBackup());
}
