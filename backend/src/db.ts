import pg from "pg";
import { config } from "./config.js";
import { migrations } from "./migrations.js";

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DB_POOL_MAX,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
});

pool.on("error", (error) => {
  console.error(JSON.stringify({ level: "error", event: "postgres_idle_client_error", message: error.message }));
});
export async function migrate() {
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", ["prepkit_schema_migrations"]);
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const migration of migrations) {
      const applied = await client.query("SELECT 1 FROM schema_migrations WHERE version=$1", [migration.version]);
      if (applied.rowCount) continue;
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query("INSERT INTO schema_migrations(version,name) VALUES($1,$2)", [migration.version, migration.name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["prepkit_schema_migrations"]); }
    finally { client.release(); }
  }
}
