// test-pg-file.mjs - same as test-pg-pooler but via file
import pg from 'pg';

const { Pool } = pg;
const url = 'postgresql://postgres.foaiwryvsctxmpbzlzrt:Pampalindaxd1.@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true';

pg.defaults.prepareThreshold = 5;

const p = new Pool({ connectionString: url, max: 1 });

const r1 = await p.query('SELECT 1 as t');
console.log('No params OK:', JSON.stringify(r1.rows));

const r2 = await p.query('SELECT $1::text as t', ['hello']);
console.log('With $1 OK:', JSON.stringify(r2.rows));

const r3 = await p.query({ text: 'SELECT $1::text as t', values: ['world'] });
console.log('Object form OK:', JSON.stringify(r3.rows));

await p.end();
