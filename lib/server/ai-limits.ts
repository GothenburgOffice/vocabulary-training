import "server-only";
import {
  dailyLetters,
  limitsToSettings,
  parseLimits,
  type AiKind,
  type AiLimits,
} from "../ai-limits";
import { db } from "./db";
import { FeedbackUnavailable } from "./requesty-client";

// Read for every AI call, so a change in the database applies at once.
export async function readLimits(): Promise<AiLimits> {
  const { rows } = await db.query("SELECT key, value FROM site_settings WHERE key LIKE 'limits.%'");
  return parseLimits(new Map(rows.map((r) => [r.key, r.value])));
}

// Saves every limit (admin), in one transaction.
export async function saveLimits(limits: AiLimits) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    for (const [key, value] of limitsToSettings(limits))
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

// Records a call's letters if they fit the account's budgets for this feature: per minute
// (bursts) and per rolling day (per account type). Otherwise nothing is recorded and the call
// is refused as "limited". Usage older than 90 days is removed as it goes.
export async function chargeLetters(
  user: { id: string; ai_tier: string },
  kind: AiKind,
  letters: number,
  limits: AiLimits,
) {
  const budget = limits[kind];
  // Parameters are cast: untyped, $3 is both an int column value and part of a bigint sum.
  const charged = await db.query(
    `WITH used AS (
       SELECT coalesce(sum(letters) FILTER (WHERE at > now() - interval '1 minute'), 0) AS minute,
              coalesce(sum(letters), 0) AS day
       FROM ai_usage WHERE user_id = $1::uuid AND kind = $2::text
         AND at > now() - interval '1 day')
     INSERT INTO ai_usage(user_id, kind, letters)
     SELECT $1::uuid, $2::text, $3::int FROM used
     WHERE minute + $3::int <= $4::bigint AND day + $3::int <= $5::bigint`,
    [user.id, kind, letters, budget.lettersPerMinute, dailyLetters(budget, user.ai_tier)],
  );
  await db.query("DELETE FROM ai_usage WHERE at < now() - interval '90 days'");
  if (!charged.rowCount) throw new FeedbackUnavailable("limited");
}

// Site-wide totals for the admin overview: calls, letters and accounts per feature.
export async function usageTotals() {
  const { rows } = await db.query(
    `SELECT kind,
       count(*) FILTER (WHERE at > now() - interval '1 day')::int AS calls_day,
       coalesce(sum(letters) FILTER (WHERE at > now() - interval '1 day'), 0)::int AS letters_day,
       count(DISTINCT user_id) FILTER (WHERE at > now() - interval '1 day')::int AS accounts_day,
       count(*) FILTER (WHERE at > now() - interval '7 days')::int AS calls_week,
       coalesce(sum(letters) FILTER (WHERE at > now() - interval '7 days'), 0)::int AS letters_week,
       count(*)::int AS calls_90,
       coalesce(sum(letters), 0)::int AS letters_90
     FROM ai_usage GROUP BY kind`,
  );
  return rows as {
    kind: AiKind;
    calls_day: number;
    letters_day: number;
    accounts_day: number;
    calls_week: number;
    letters_week: number;
    calls_90: number;
    letters_90: number;
  }[];
}
