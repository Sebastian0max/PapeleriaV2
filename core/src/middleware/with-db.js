import { getClient } from "../db/postgres-connection.js";

export async function withDb(request, reply) {
  const client = await getClient();
  request.client = client;

  try {
    await client.query("BEGIN");

    const tenantId = request.tenantId;
    if (tenantId) {
      await client.query("SET LOCAL app.tenant_id = $1", [tenantId]);
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
