import { getClient } from "./postgres-connection.js";
import { schemaSQL } from "./postgres-schema.js";
import { rlsSQL } from "./postgres-rls.js";
import { provisionTenant, seedDefaultPermissions } from "./postgres-seed.js";

export async function runMigrationIfNeeded() {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    await client.query(schemaSQL);
    await client.query(rlsSQL);
    await seedDefaultPermissions(client);

    const defaultSubdomain = process.env.DEFAULT_TENANT_SUBDOMAIN || "app";
    const defaultName = process.env.DEFAULT_TENANT_NAME || "Papelería";
    await provisionTenant(client, defaultSubdomain, defaultName);

    await client.query("COMMIT");
    console.log("Postgres migration completed successfully");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Postgres migration failed:", err.message);
    throw err;
  } finally {
    client.release();
  }
}
