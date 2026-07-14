import { getClient } from "../db/postgres-connection.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withDb(request, reply) {
  const client = await getClient();
  request.client = client;

  try {
    await client.query("BEGIN");

    const tenantId = request.tenantId;
    if (tenantId) {
      if (!UUID_RE.test(tenantId)) {
        client.release();
        return reply.status(400).send({ error: "Tenant ID invalido" });
      }
      await client.query(`SET LOCAL app.tenant_id = '${tenantId.replace(/'/g, "''")}'`);
    }

    reply.then(async () => {
      try {
        await client.query("COMMIT");
      } catch (err) {
        console.error("Error committing transaction:", err.message);
      } finally {
        client.release();
      }
    }, async (err) => {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        console.error("Error rolling back transaction:", rollbackErr.message);
      } finally {
        client.release();
      }
    });
  } catch (err) {
    client.release();
    throw err;
  }
}
