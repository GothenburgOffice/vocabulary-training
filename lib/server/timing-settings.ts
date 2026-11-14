import "server-only";
import {
  MAX_BUCKET,
  MIN_BUCKET,
  MIN_SAMPLES,
  parseTimingSettings,
  timingToSettings,
  type InputType,
  type TimingSettings,
} from "@/lib/timing";
import { db } from "./db";

// The answer-timing settings (#2), site settings "timing.…"; defaults for anything missing.
export async function readTimingSettings(): Promise<TimingSettings> {
  const { rows } = await db.query("SELECT key, value FROM site_settings WHERE key LIKE 'timing.%'");
  return parseTimingSettings(new Map(rows.map((r) => [r.key, r.value])));
}

export async function saveTimingSettings(settings: TimingSettings) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (const [key, value] of timingToSettings(settings))
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
    client.release();
  }
}

// What admin sees to calibrate, site-wide per input type: answers measured, accounts with
// enough answers to have a usual, and the count of scored answers per score step. No account.
export type TimingSummary = Record<
  InputType,
  { answers: number; accounts: number; buckets: [number, number][] }
>;
export async function readTimingSummary(): Promise<TimingSummary> {
  const totals = await db.query(
    `SELECT input, coalesce(sum(samples), 0)::bigint AS answers,
       count(*) FILTER (WHERE samples >= $1)::int AS accounts
     FROM answer_timing GROUP BY input`,
    [MIN_SAMPLES],
  );
  const buckets = await db.query(
    "SELECT input, bucket, answers FROM answer_timing_buckets WHERE bucket BETWEEN $1 AND $2",
    [MIN_BUCKET, MAX_BUCKET],
  );
  const empty = () => ({ answers: 0, accounts: 0, buckets: [] as [number, number][] });
  const summary: TimingSummary = { keyboard: empty(), touch: empty() };
  for (const t of totals.rows)
    summary[t.input as InputType] = {
      ...summary[t.input as InputType],
      answers: Number(t.answers),
      accounts: t.accounts,
    };
  for (const b of buckets.rows)
    summary[b.input as InputType].buckets.push([b.bucket, Number(b.answers)]);
  return summary;
}
