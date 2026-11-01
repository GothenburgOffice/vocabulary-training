import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import { bootstrapAdmin } from "./admin-bootstrap.mjs";
import { seedSiteSettings } from "./settings-bootstrap.mjs";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(529216831)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir(new URL("../db/migrations/", import.meta.url)))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if ((await client.query("SELECT 1 FROM schema_migrations WHERE name=$1", [name])).rowCount)
      continue;
    await client.query(
      await readFile(new URL(`../db/migrations/${name}`, import.meta.url), "utf8"),
    );
    await client.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
    console.log(`Applied ${name}`);
  }
  const admin = await bootstrapAdmin(client);
  if (admin === "created" || admin === "promoted")
    console.log(`Admin account ${admin}: ${process.env.ADMIN_EMAIL?.trim().toLowerCase()}`);
  const seeded = await seedSiteSettings(client);
  if (seeded) console.log(`Seeded ${seeded} site settings (registration, privacy) from .env.`);
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("Migration failed:", e instanceof Error ? e.message : "unknown database error");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
