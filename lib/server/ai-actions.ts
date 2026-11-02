import "server-only";
import { db } from "./db";

const CLEANUP_INTERVAL_MS = 60_000;

async function pruneAiActions() {
  await db.query("DELETE FROM ai_actions WHERE at < now() - interval '24 hours'");
}

const globalCleanup = globalThis as unknown as { aiActionsCleanup?: NodeJS.Timeout };
if (!globalCleanup.aiActionsCleanup) {
  void pruneAiActions().catch(() => {});
  globalCleanup.aiActionsCleanup = setInterval(
    () => void pruneAiActions().catch(() => {}),
    CLEANUP_INTERVAL_MS,
  );
  globalCleanup.aiActionsCleanup.unref();
}

export async function recordAiAction(action: {
  userId: string;
  kind: "speech" | "note";
  model: string;
  wordId: string;
  word: string;
  prompt: Record<string, unknown>;
}) {
  await pruneAiActions();
  await db.query(
    `INSERT INTO ai_actions(user_id, kind, model, word_id, word, prompt)
     VALUES ($1::uuid, $2::text, $3::text, $4::uuid, $5::text, $6::jsonb)`,
    [
      action.userId,
      action.kind,
      action.model,
      action.wordId,
      action.word,
      JSON.stringify(action.prompt),
    ],
  );
}
