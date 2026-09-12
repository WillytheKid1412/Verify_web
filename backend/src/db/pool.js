import pg from "pg";
import { config } from "../config.js";

const { Pool } = pg;
let pool;

function poolOptions() {
  return {
    connectionString: config.database.url,
    max: config.database.poolMax,
    connectionTimeoutMillis: config.database.connectionTimeoutMs,
    idleTimeoutMillis: config.database.idleTimeoutMs,
    statement_timeout: config.database.statementTimeoutMs,
    application_name: "patient-verify-backend",
    ssl: config.database.sslMode === "disable" ? false : {
      ca: config.database.ca,
      rejectUnauthorized: true,
    },
  };
}

export function getPool() {
  if (!pool) {
    pool = new Pool(poolOptions());
    pool.on("error", (error) => console.error("PostgreSQL pool error", { message: error.message }));
  }
  return pool;
}

export function query(text, values) {
  return getPool().query(text, values);
}

export async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabase() {
  await query("SELECT 1");
}

export async function closePool() {
  if (!pool) return;
  const closing = pool;
  pool = undefined;
  await closing.end();
}
