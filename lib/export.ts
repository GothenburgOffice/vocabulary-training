import type { History, List } from "./learning";
import type { WorkspaceData } from "./workspace";

// The account's full data download (#10): everything the app stores for the account, in
// one JSON file meant for people to keep and read. There is no import for it yet.
// Times are ISO 8601 (UTC). Bump EXPORT_VERSION when the shape changes.
export const EXPORT_FORMAT = "vocabulary.training export";
export const EXPORT_VERSION = 1;

export type ExportAccount = {
  email: string;
  createdAt: Date;
  accountType: string;
  lastSignInAt: Date | null;
};
// One AI request that reached the provider: what kind, how many letters, when (no text).
export type ExportAiUsage = { kind: string; letters: number; at: Date };

const iso = (ms: number | undefined) => (ms ? new Date(ms).toISOString() : null);

// Review state for one direction. A word never practised that way has nothing scheduled.
function review(h: History) {
  return {
    correct: h.correct,
    wrong: h.wrong,
    streak: h.streak,
    due: h.correct + h.wrong > 0 ? iso(h.due) : null,
  };
}

function exportList(list: List) {
  return {
    id: list.id,
    title: list.title,
    description: list.description,
    baseLanguage: list.from,
    learningLanguage: list.to,
    words: list.words.map((w) => ({
      id: w.id,
      prompt: w.front,
      answers: [w.back, ...(w.accepted ?? [])],
      review: { forward: review(w.forward), reverse: review(w.reverse) },
    })),
  };
}

export function exportDocument(
  account: ExportAccount,
  data: WorkspaceData,
  aiUsage: ExportAiUsage[],
  now: Date,
) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    account: {
      email: account.email,
      createdAt: account.createdAt.toISOString(),
      accountType: account.accountType,
      lastSignInAt: account.lastSignInAt?.toISOString() ?? null,
    },
    profile: { baseLanguage: data.baseLanguage, learningLanguage: data.learningLanguage },
    lists: data.lists.map(exportList),
    sessions: data.runs.map((run) => ({
      id: run.id ?? null,
      listId: run.listId ?? null,
      title: run.title,
      mode: run.mode ?? null,
      baseLanguage: run.from,
      learningLanguage: run.to,
      completedAt: iso(run.completedAt),
      results: run.results.map((r) => ({
        prompt: r.word.front,
        expected: r.word.back,
        answer: r.answer,
        correct: r.correct,
        direction: r.direction,
        answeredAt: iso(r.answeredAt),
      })),
    })),
    aiUsage: aiUsage.map((u) => ({ kind: u.kind, letters: u.letters, at: u.at.toISOString() })),
  };
}

// e.g. vocabulary-training-export-2026-11-03.json
export const exportFileName = (now: Date) =>
  `vocabulary-training-export-${now.toISOString().slice(0, 10)}.json`;
