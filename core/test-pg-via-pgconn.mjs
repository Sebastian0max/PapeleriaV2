// test-pg-via-pgconn.mjs - uses postgres-connection module
import('./src/db/postgres-connection.js').then(async (m) => {
  const c = await m.getClient();
  const r = await c.query('SELECT $1::text as t', ['hello']);
  console.log('OK:', JSON.stringify(r.rows));
  c.release();
  await m.closePool();
}).catch(e => console.log('FAIL:', e.message, e.code));
