import pg from "pg";

const { Pool } = pg;

let pool = null;

export function getPool() {
  if (!pool) {
    const prepareThreshold = parseInt(process.env.PG_PREPARE_THRESHOLD || "5", 10);
    pool = new Pool({
      connectionString: process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL,
      max: parseInt(process.env.PG_POOL_MAX || "20", 10),
      idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || "30000", 10),
      connectionTimeoutMillis: parseInt(process.env.PG_CONNECT_TIMEOUT || "10000", 10),
      prepareThreshold,
    });

    pool.on("error", (err) => {
      console.error("Postgres pool error:", err.message);
    });
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

export async function getClient() {
  return getPool().connect();
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
