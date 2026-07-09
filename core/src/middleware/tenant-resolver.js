import { getPool } from "../db/postgres-connection.js";

export async function resolveTenantId(hostname) {
  const pool = getPool();
  const subdomain = hostname.split(".")[0];

  const { rows } = await pool.query(
    "SELECT id FROM tenants WHERE subdomain = $1",
    [subdomain]
  );

  return rows.length === 0 ? null : rows[0].id;
}

export async function tenantResolver(request, reply) {
  const hostname = request.hostname;

  if (hostname.startsWith("localhost") || hostname.startsWith("127.0.0.1") || hostname === "0.0.0.0") {
    const pool = getPool();
    const { rows } = await pool.query(
      "SELECT id FROM tenants ORDER BY created_at ASC LIMIT 1"
    );
    request.tenantId = rows.length > 0 ? rows[0].id : null;
    return;
  }

  const tenantId = await resolveTenantId(hostname);
  if (!tenantId) {
    reply.status(404).send({ error: "Tenant not found" });
    return;
  }
  request.tenantId = tenantId;
}
