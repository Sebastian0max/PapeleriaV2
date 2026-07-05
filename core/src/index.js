import { buildApp } from "./app.js";
import { config } from "./config.js";
import { getDb } from "./db/connection.js";

getDb();

const app = buildApp();
await app.listen({ host: config.host, port: config.port });
