import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, withTransaction } from "../src/db/pool.js";
import { validateRuntimeConfig } from "../src/config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(here, "../src/db/migrations");

async function migrate() {
  validateRuntimeConfig();
  const files = (await fs.readdir(migrationsDirectory)).filter((name) => name.endsWith(".sql")).sort();
  await withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1)", [713_094_821]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const applied = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((row) => row.name));
    for (const name of files) {
      if (applied.has(name)) continue;
      const sql = await fs.readFile(path.join(migrationsDirectory, name), "utf8");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      console.log(`Applied migration ${name}`);
    }
  });
}

migrate()
  .then(() => closePool())
  .catch(async (error) => {
    console.error(error.message);
    await closePool().catch(() => {});
    process.exitCode = 1;
  });
