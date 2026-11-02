import "server-only";
import { randomUUID } from "node:crypto";
import type { Activity, IssueReport, ReportReason } from "../reports";
import { db } from "./db";
import { HttpError } from "./http";

type ActivityRow = Omit<Activity, "createdAt"> & { created_at: Date };
type ReportRow = Omit<ActivityRow, "id"> & {
  id: string;
  activity_id: string;
  activity_created_at: Date;
  reason: ReportReason;
};

const activity = (row: ActivityRow): Activity => ({
  id: row.id,
  kind: row.kind,
  word: row.word,
  language: row.language,
  model: row.model,
  voice: row.voice,
  tier: row.tier,
  createdAt: row.created_at.toISOString(),
});
const report = (row: ReportRow): IssueReport => ({
  id: row.id,
  reason: row.reason,
  activity: activity({
    ...row,
    id: row.activity_id,
    created_at: row.activity_created_at,
  }),
  createdAt: row.created_at.toISOString(),
});

export async function recordActivity(userId: string, input: Omit<Activity, "id" | "createdAt">) {
  await db.query(
    `WITH expired AS (
       DELETE FROM ai_activity WHERE user_id = $1 AND created_at <= now() - interval '1 hour'
     )
     INSERT INTO ai_activity (id, user_id, kind, word, language, model, voice, tier)
     VALUES ($2, $1, $3, $4, $5, $6, $7, $8)`,
    [
      userId,
      randomUUID(),
      input.kind,
      input.word,
      input.language,
      input.model,
      input.voice,
      input.tier,
    ],
  );
}

export async function readRecentActivity(userId: string): Promise<Activity[]> {
  const { rows } = await db.query<ActivityRow>(
    `WITH expired AS (
       DELETE FROM ai_activity WHERE user_id = $1 AND created_at <= now() - interval '1 hour'
     )
     SELECT id, kind, word, language, model, voice, tier, created_at
     FROM ai_activity
     WHERE user_id = $1 AND created_at > now() - interval '1 hour'
     ORDER BY created_at DESC, id DESC LIMIT 100`,
    [userId],
  );
  return rows.map(activity);
}

export async function createReport(
  userId: string,
  activityId: string,
  reason: ReportReason,
): Promise<IssueReport> {
  const { rows } = await db.query<ReportRow>(
    `INSERT INTO issue_reports
       (id, user_id, activity_id, reason, kind, word, language, model, voice, tier,
        activity_created_at)
     SELECT $3, user_id, id, $4, kind, word, language, model, voice, tier, created_at
     FROM ai_activity
     WHERE user_id = $1 AND id = $2 AND created_at > now() - interval '1 hour'
     ON CONFLICT (user_id, activity_id) DO NOTHING
     RETURNING *`,
    [userId, activityId, randomUUID(), reason],
  );
  if (rows[0]) return report(rows[0]);
  // Keep missing, expired and foreign activity indistinguishable.
  const existing = await db.query(
    "SELECT 1 FROM issue_reports WHERE user_id = $1 AND activity_id = $2",
    [userId, activityId],
  );
  if (existing.rowCount) throw new HttpError(409, "This activity has already been reported.");
  throw new HttpError(404, "Recent activity not found.");
}

export async function readReports(): Promise<IssueReport[]> {
  const { rows } = await db.query<ReportRow>(
    "SELECT * FROM issue_reports ORDER BY created_at DESC, id DESC LIMIT 200",
  );
  return rows.map(report);
}

export async function pruneReports(): Promise<number> {
  const result = await db.query(
    "DELETE FROM issue_reports WHERE created_at < now() - interval '15 days'",
  );
  return result.rowCount ?? 0;
}
