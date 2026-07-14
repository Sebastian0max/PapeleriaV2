import { getClient } from "./postgres-connection.js";
import { schemaSQL } from "./postgres-schema.js";
import { rlsSQL } from "./postgres-rls.js";
import { provisionTenant, seedDefaultPermissions, seedAdminRoleWithPermissions, seedDefaultUser } from "./postgres-seed.js";

export async function runMigrationIfNeeded() {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    await client.query(schemaSQL);
    await client.query(rlsSQL);
    await seedDefaultPermissions(client);

    // Ensure all existing admin roles have all permissions (for tenants created before new permissions were added)
    const { rows: allPerms } = await client.query(`SELECT id FROM permisos`);
    const { rows: adminRoles } = await client.query(`SELECT id, tenant_id FROM roles WHERE nombre = 'admin' AND es_sistema = TRUE`);
    for (const role of adminRoles) {
      for (const perm of allPerms) {
        await client.query(
          `INSERT INTO rol_permisos (tenant_id, rol_id, permiso_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [role.tenant_id, role.id, perm.id]
        );
      }
    }

    const defaultSubdomain = process.env.DEFAULT_TENANT_SUBDOMAIN || "app";
    const defaultName = process.env.DEFAULT_TENANT_NAME || "Papelería";
    const tenantId = await provisionTenant(client, defaultSubdomain, defaultName);

    await seedAdminRoleWithPermissions(client, tenantId);

    const { rows: roles } = await client.query(
      `SELECT id FROM roles WHERE tenant_id = $1 AND nombre = 'admin'`,
      [tenantId]
    );
    await seedDefaultUser(client, tenantId, roles[0]?.id);

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
