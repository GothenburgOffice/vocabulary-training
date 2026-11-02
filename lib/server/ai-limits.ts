import "server-only";
import { dailyLetters, parseLimits, type AiKind, type AiLimits } from "../ai-limits";
import { db } from "./db";
import { FeedbackUnavailable } from "./requesty-client";

// Read for every AI call, so a change in the database applies at once.
export async function readLimits(): Promise<AiLimits> {
  const { rows } = await db.query("SELECT key, value FROM site_settings WHERE key LIKE 'limits.%'");
  return parseLimits(new Map(rows.map((r) => [r.key, r.value])));
}

// Records a call's letters if they fit the account's budgets for this feature: per minute
// (bursts) and per rolling day (per account type); a budget of 0 is no limit. Otherwise
// nothing is recorded and the call is refused as "limited". Usage older than 90 days is
// removed as it goes.
export async function chargeLetters(
  user: { id: string; ai_tier: string },
  kind: AiKind,
  letters: number,
  limits: AiLimits,
) {
  const budget = limits[kind];
  const client = await db.connect();
  let charged = 0;
  try {
    await client.query("BEGIN");
    // One charge at a time per account and feature, across server processes: without the
    // lock, simultaneous calls could all see the same totals and together exceed a budget.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `ai_usage:${user.id}:${kind}`,
    ]);
    // Parameters are cast: untyped, $3 is both an int column value and part of a bigint sum.
    const result = await client.query(
      `WITH used AS (
         SELECT coalesce(sum(letters) FILTER (WHERE at > now() - interval '1 minute'), 0) AS minute,
                coalesce(sum(letters), 0) AS day
         FROM ai_usage WHERE user_id = $1::uuid AND kind = $2::text
           AND at > now() - interval '1 day')
       INSERT INTO ai_usage(user_id, kind, letters)
       SELECT $1::uuid, $2::text, $3::int FROM used
       WHERE ($4::bigint = 0 OR minute + $3::int <= $4::bigint)
         AND ($5::bigint = 0 OR day + $3::int <= $5::bigint)`,
      [user.id, kind, letters, budget.lettersPerMinute, dailyLetters(budget, user.ai_tier)],
    );
    charged = result.rowCount ?? 0;
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  await db.query("DELETE FROM ai_usage WHERE at < now() - interval '90 days'");
  if (!charged) throw new FeedbackUnavailable("limited");
}

// Site-wide totals for the admin overview: calls, letters and accounts per feature, for the
// last day, week and 90 days. Older rows are left out even before they are cleaned up.
export async function usageTotals() {
  const { rows } = await db.query(
    `SELECT kind,
       count(*) FILTER (WHERE at > now() - interval '1 day')::int AS calls_day,
       coalesce(sum(letters) FILTER (WHERE at > now() - interval '1 day'), 0)::int AS letters_day,
       count(DISTINCT user_id) FILTER (WHERE at > now() - interval '1 day')::int AS accounts_day,
       count(*) FILTER (WHERE at > now() - interval '7 days')::int AS calls_week,
       coalesce(sum(letters) FILTER (WHERE at > now() - interval '7 days'), 0)::int AS letters_week,
       count(DISTINCT user_id) FILTER (WHERE at > now() - interval '7 days')::int AS accounts_week,
       count(*)::int AS calls_90,
       coalesce(sum(letters), 0)::int AS letters_90,
       count(DISTINCT user_id)::int AS accounts_90
     FROM ai_usage WHERE at > now() - interval '90 days' GROUP BY kind`,
  );
  return rows as ({ kind: AiKind } & Record<
    `${"calls" | "letters" | "accounts"}_${"day" | "week" | "90"}`,
    number
  >)[];
}
