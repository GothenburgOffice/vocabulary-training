import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import type { ReportInput } from "../reports";

// Saves one learner report, anonymously: only the tier comes from the session, no account is
// stored, the result's id is hashed, and times are cut to the day (see migration 010). A second
// report of the same result is a no-op.
export async function saveReport(tier: string, report: ReportInput) {
  const result = await db.query(
    `INSERT INTO issue_reports
       (id, activity_hash, reason, kind, word, language, model, voice, tier, prompt, activity_on)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, ($10::timestamptz AT TIME ZONE 'UTC')::date)
     ON CONFLICT (activity_hash) DO NOTHING
     RETURNING id`,
    [
      createHash("sha256").update(report.activityId).digest("hex"),
      report.reason,
      report.kind,
      report.word,
      report.language,
      report.model,
      report.voice ?? null,
      tier,
      JSON.stringify(report.prompt),
      report.at,
    ],
  );
  return result.rowCount ? ("saved" as const) : ("duplicate" as const);
}

// Admin only (#95): every report on the server, newest first. Reports carry no account.
export async function listReports(offset: number, limit: number) {
  const result = await db.query(
    `SELECT id, created_at, activity_at, kind, reason, word, language, model, voice, tier, prompt
     FROM issue_reports
     ORDER BY created_at DESC, id
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows;
}

// Admin only: where reports cluster, to see which language, model or voice needs attention.
export async function reportSummary() {
  const result = await db.query(
    `SELECT kind, language, model, coalesce(voice, '') AS voice,
       count(*)::int AS reports, max(created_at) AS last
     FROM issue_reports
     GROUP BY kind, language, model, coalesce(voice, '')
     ORDER BY reports DESC, last DESC
     LIMIT 20`,
  );
  return result.rows;
}

export async function countReports(olderThanDays?: number) {
  const result =
    olderThanDays === undefined
      ? await db.query("SELECT count(*)::int AS n FROM issue_reports")
      : await db.query(
          "SELECT count(*)::int AS n FROM issue_reports WHERE created_at < now() - make_interval(days => $1)",
          [olderThanDays],
        );
  return result.rows[0].n as number;
}

// Admin only: deletes reports older than the given number of days.
export async function pruneReports(olderThanDays: number) {
  const result = await db.query(
    "DELETE FROM issue_reports WHERE created_at < now() - make_interval(days => $1)",
    [olderThanDays],
  );
  return result.rowCount ?? 0;
}
