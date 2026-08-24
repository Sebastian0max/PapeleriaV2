// test-pg-with-begin.mjs - simulate what with-db does
import('./src/db/postgres-connection.js').then(async (m) => {
  // Simulate what with-db does
  const c = await m.getClient();
  try {
    await c.query('BEGIN');
    
    // Try SET LOCAL with parameter (like with-db does)
    try {
      await c.query("SET LOCAL app.tenant_id = $1", ['test-tenant']);
      console.log('SET LOCAL OK');
    } catch (e) {
      console.log('SET LOCAL FAIL:', e.message);
    }
    
    // Now try a parameterized query
    const r = await c.query('SELECT $1::text as t', ['hello']);
    console.log('Param query OK:', JSON.stringify(r.rows));
    
    await c.query('COMMIT');
  } catch (e) {
    console.log('FAIL:', e.message, 'code:', e.code);
    try { await c.query('ROLLBACK'); } catch {}
  }
  c.release();
  
  // Second connect
  const c2 = await m.getClient();
  try {
    const r2 = await c2.query('SELECT $1::text as t', ['world']);
    console.log('Second connect OK:', JSON.stringify(r2.rows));
  } catch (e) {
    console.log('Second connect FAIL:', e.message);
  }
  c2.release();
  
  await m.closePool();
}).catch(e => console.log('ERR:', e.message));
