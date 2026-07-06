import { buildApp } from "./app.js";
import { config } from "./config.js";
import { downloadDb, startPeriodicBackup, flushOnShutdown } from "./services/cloud-backup.js";
import { getDb } from "./db/connection.js";
import { purgeOldTrash } from "./services/products-service.js";

// Restore DB from cloud before anything else
await downloadDb();

getDb();

// Purge old trash on startup (items older than 7 days)
const purged = purgeOldTrash(7);
console.log(`[startup] Papelera: ${purged.purged} productos purgados.`);

const app = buildApp();
await app.listen({ host: config.host, port: config.port });

// Start periodic cloud backups
startPeriodicBackup();

// Flush pending uploads before shutdown
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
