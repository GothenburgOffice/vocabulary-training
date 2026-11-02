import "server-only";
import { db } from "./db";
import type { ReportInput } from "../reports";

// Saves one learner report. The account and its tier come from the session, never the request;
// a second report of the same result is a no-op (one report per result per account).
export async function saveReport(user: { id: string; ai_tier: string }, report: ReportInput) {
  const result = await db.query(
    `INSERT INTO issue_reports
       (id, user_id, activity_id, reason, kind, word, language, model, voice, tier, prompt, activity_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (user_id, activity_id) DO NOTHING
     RETURNING id`,
    [
      user.id,
      report.activityId,
      report.reason,
      report.kind,
      report.word,
      report.language,
      report.model,
      report.voice ?? null,
      user.ai_tier,
      JSON.stringify(report.prompt),
      report.at,
    ],
  );
  return result.rowCount ? ("saved" as const) : ("duplicate" as const);
}
