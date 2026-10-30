import "server-only";
import pg from "pg";
const globalDb = globalThis as unknown as { vocabularyPool?: pg.Pool };
export const db = globalDb.vocabularyPool ?? new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000,
});
if (process.env.NODE_ENV !== "production") globalDb.vocabularyPool = db;
