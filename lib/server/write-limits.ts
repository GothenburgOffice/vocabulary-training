import "server-only";
import {
  parseWriteLimits,
  WriteLimiter,
  writeLimitsToSettings,
  type WriteLimits,
} from "../write-limits";
import { db } from "./db";
import { HttpError } from "./http";

const limiter = new WriteLimiter();
// Read at most every 30 seconds; a save in Admin → Limits applies at once in this process.
// Each save bumps the version, so a read that started before it can't cache the old values.
let cached: { limits: WriteLimits; at: number } | null = null;
let version = 0;
export async function readWriteLimits(): Promise<WriteLimits> {
  if (cached && Date.now() - cached.at < 30_000) return cached.limits;
  const started = version;
  const { rows } = await db.query(
    "SELECT key, value FROM site_settings WHERE key LIKE 'limits.writes.%'",
  );
  const limits = parseWriteLimits(new Map(rows.map((r) => [r.key, r.value])));
  if (version === started) cached = { limits, at: Date.now() };
  return limits;
}
export async function saveWriteLimits(limits: WriteLimits) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (const [key, value] of writeLimitsToSettings(limits))
      await client.query(
        `INSERT INTO site_settings(key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
        [key, value],
      );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    version += 1;
    cached = null;
    client.release();
  }
}

// Every route that writes an account's data calls this after requireUser. It counts every
// request to such a route, refused ones too: a script sending junk is stopped like one
// sending saves, and the app itself only sends valid requests. Over the limit,
// the account's last hit is recorded for the admin (at most once a minute) and the request
// is refused with 429; the client keeps the change and asks for a retry.
export async function limitWrites(userId: string) {
  if (limiter.take(userId, Date.now(), await readWriteLimits())) return;
  await db.query(
    `UPDATE users SET write_limited_at = now()
     WHERE id = $1 AND (write_limited_at IS NULL OR write_limited_at < now() - interval '1 minute')`,
    [userId],
  );
  throw new HttpError(
    429,
    "This account is saving changes faster than a person can. Wait a while, then retry.",
  );
}
