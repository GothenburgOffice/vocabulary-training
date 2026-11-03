import "server-only";
import { createHash } from "node:crypto";
import { db } from "./db";
import type { ReportListQuery, ReportSort } from "../admin/reports";
import { REPORT_KIND_LABELS, REPORT_REASON_LABELS, type ReportInput } from "../reports";

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
const literal = (text: string) => `'${text.replaceAll("'", "''")}'`;
// Type and reason sort by the labels the table shows, not their stored codes.
const KIND_LABEL = `CASE kind ${Object.entries(REPORT_KIND_LABELS)
  .map(([code, label]) => `WHEN ${literal(code)} THEN ${literal(label)}`)
  .join(" ")} END`;
const REASON_LABEL = `CASE reason ${Object.entries(REPORT_REASON_LABELS)
  .map(([code, label]) => `WHEN ${literal(code)} THEN ${literal(label)}`)
  .join(" ")} END`;

// What each sortable column orders by, from fixed lists (never the request text). A report
// without a voice sorts after the rest in ascending order.
const REPORT_ORDER: Record<ReportSort, string[]> = {
  reported: ["reported_on"],
  activity: ["activity_on"],
  kind: [KIND_LABEL],
  reason: [REASON_LABEL],
  word: ["lower(word)"],
  language: ["lower(language)"],
  model: ["lower(model)"],
  voice: ["voice IS NULL", "coalesce(lower(voice), '')"],
  tier: ["tier"],
};

// A page of reports in one order. The whole key (the column, then date and id, all in the
// same direction) compares as one row, so the next page starts strictly after the last report
// shown (`after`) by its key: reports saved or pruned in between can't shift a page to repeat
// or skip one.
export async function listReports(limit: number, query: ReportListQuery) {
  const key = [...REPORT_ORDER[query.sort], "reported_on", "id"];
  const dir = query.dir === "asc" ? "ASC" : "DESC";
  const columns = `id, reported_on::text AS reported_on, activity_on::text AS activity_on, kind, reason, word, language, model, voice, tier, prompt`;
  const order = key.map((part) => `${part} ${dir}`).join(", ");
  const result = query.after
    ? await db.query(
        `SELECT ${columns} FROM issue_reports
         WHERE (${key.join(", ")}) ${dir === "ASC" ? ">" : "<"}
           (SELECT ${key.join(", ")} FROM issue_reports WHERE id = $2)
         ORDER BY ${order} LIMIT $1`,
        [limit, query.after],
      )
    : await db.query(`SELECT ${columns} FROM issue_reports ORDER BY ${order} LIMIT $1`, [limit]);
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
