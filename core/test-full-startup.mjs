// test-full-startup.mjs - replicates what src/index.js does
import { buildApp } from "./src/app.js";
import { config } from "./src/config.js";
import { getDb } from "./src/db/connection.js";
import { purgeOldTrash } from "./src/services/products-service.js";

const isPostgres = !!process.env.SUPABASE_DATABASE_URL;

if (isPostgres) {
  console.log("[startup] Postgres mode.");
  const { runMigrationIfNeeded } = await import("./src/db/postgres-migrate.js");
  await runMigrationIfNeeded();
  console.log("[startup] Postgres schema & seed complete.");
} else {
  console.log("[startup] SQLite mode.");
  getDb();
  const purged = purgeOldTrash(7);
  console.log(`[startup] Papelera: ${purged.purged} productos purgados.`);
}

const app = buildApp();
await app.listen({ host: config.host, port: config.port });
