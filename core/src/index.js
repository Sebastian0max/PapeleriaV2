import { buildApp } from "./app.js";
import { config } from "./config.js";
import { downloadDb } from "./services/cloud-backup.js";
import { getDb } from "./db/connection.js";

// Restore DB from cloud before anything else
await downloadDb();

getDb();

const app = buildApp();
await app.listen({ host: config.host, port: config.port });
