import "server-only";
import { db } from "./db";
import type { ReportInput } from "../reports";

// Saves one learner report, anonymously: only the tier comes from the session, and no account
// is stored. A second report of the same result is a no-op.
export async function saveReport(tier: string, report: ReportInput) {
  const result = await db.query(
    `INSERT INTO issue_reports
       (id, activity_id, reason, kind, word, language, model, voice, tier, prompt, activity_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (activity_id) DO NOTHING
     RETURNING id`,
    [
      report.activityId,
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
