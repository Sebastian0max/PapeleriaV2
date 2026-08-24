import { buildApp } from "./app.js";
import { config } from "./config.js";
import { getDb } from "./db/connection.js";
import { purgeOldTrash } from "./services/products-service.js";
import { purgeOldCancelled } from "./services/transactions-service.js";

const isPostgres = !!process.env.SUPABASE_DATABASE_URL;

async function runCancelledPurge() {
  try {
    if (isPostgres) {
      const { getClient } = await import("./db/postgres-connection.js");
        const client = await getClient();
      try {
        await client.query("BEGIN");
        const { rows: tenants } = await client.query("SELECT DISTINCT tenant_id FROM transactions WHERE revertida = true");
        let total = 0;
        for (const { tenant_id } of tenants) {
          const result = await purgeOldCancelled({ client, tenantId: tenant_id });
          total += result.purged;
        }
        await client.query("COMMIT");
        console.log(`[purge] Canceladas: ${total} transacciones purgadas.`);
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("[purge] Error purgando canceladas:", err.message);
      } finally {
        client.release();
      }
    } else {
      const result = purgeOldCancelled();
      console.log(`[purge] Canceladas: ${result.purged} transacciones purgadas.`);
    }
  } catch (err) {
    console.error("[purge] Error purgando canceladas:", err.message);
  }
}

if (isPostgres) {
  console.log("[startup] Postgres mode.");
  const { runMigrationIfNeeded } = await import("./db/postgres-migrate.js");
  await runMigrationIfNeeded();
  console.log("[startup] Postgres schema & seed complete.");
  await runCancelledPurge();
  setInterval(() => {
    const h = new Date().getHours();
    if (h === 3) runCancelledPurge();
  }, 3600_000);
} else {
  console.log("[startup] SQLite mode.");
  const { downloadDb, flushOnShutdown } = await import("./services/cloud-backup.js");
  if (process.env.NODE_ENV === "production" && (process.env.SUPABASE_URL || process.env.SUPABASE_SERVICE_KEY)) {
    console.error(
      "[startup] ADVERTENCIA CRITICA: el servidor esta en modo SQLite/legacy en produccion " +
      "porque falta SUPABASE_DATABASE_URL. El sync automatico cada 15s fue ELIMINADO " +
      "(causa del consumo de ancho de banda). Configura SUPABASE_DATABASE_URL para " +
      "ejecutar en modo Postgres."
    );
  }
  await downloadDb();
  getDb();
  const purged = purgeOldTrash(7);
  console.log(`[startup] Papelera: ${purged.purged} productos purgados.`);
  await runCancelledPurge();
  setInterval(async () => {
    const h = new Date().getHours();
    if (h === 3) {
      const { createDailyBackup } = await import("./services/backup-service.js");
      await createDailyBackup();
      runCancelledPurge();
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
