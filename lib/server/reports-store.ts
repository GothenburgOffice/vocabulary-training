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
