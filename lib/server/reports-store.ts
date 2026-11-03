import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import type { ReportListQuery, ReportSort } from "../admin/reports";
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

// Admin only (#95): reports newest first, one page after `before` (keyset paging, so a report
// arriving or a prune between pages never repeats or skips a row). Reports carry no account.
// What each sortable column orders by; the column and direction come from fixed lists, never
// from the request text. Ties fall back to newest first, then id, so pages don't overlap.
const REPORT_ORDER: Record<ReportSort, string> = {
  reported: "reported_on",
  activity: "activity_on",
  kind: "kind",
  reason: "reason",
  word: "lower(word)",
  language: "lower(language)",
  model: "lower(model)",
  voice: "lower(voice)",
  tier: "tier",
};

export async function listReports(limit: number, query: ReportListQuery) {
  const dir = query.dir === "asc" ? "ASC" : "DESC";
  const result = await db.query(
    `SELECT id, reported_on::text AS reported_on, activity_on::text AS activity_on, kind, reason, word, language, model, voice, tier, prompt
     FROM issue_reports
     ORDER BY ${REPORT_ORDER[query.sort]} ${dir} NULLS LAST, reported_on DESC, id DESC
     LIMIT $1 OFFSET $2`,
    [limit, query.offset],
  );
  return result.rows;
}

export async function countReports(olderThanDays?: number) {
  const result =
    olderThanDays === undefined
      ? await db.query("SELECT count(*)::int AS n FROM issue_reports")
      : await db.query(
          "SELECT count(*)::int AS n FROM issue_reports WHERE reported_on < current_date - $1::int",
          [olderThanDays],
        );
  return result.rows[0].n as number;
}

// Admin only: deletes reports older than the given number of days.
export async function pruneReports(olderThanDays: number) {
  const result = await db.query(
    "DELETE FROM issue_reports WHERE reported_on < current_date - $1::int",
    [olderThanDays],
  );
  return result.rowCount ?? 0;
}
