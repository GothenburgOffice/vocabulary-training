import "server-only";
import type pg from "pg";
import type { z } from "zod";
import {
  directionOf,
  freshHistory,
  promptOf,
  reviewed,
  type History,
  type List,
} from "@/lib/learning";
import type { listSaveSchema, profileSchema, reviewSchema, runSaveSchema } from "@/lib/validation";
import type { AiWord } from "@/lib/ai-words";
import type { ExportSource } from "@/lib/export";
import type { Run, WorkspaceData } from "@/lib/workspace";
import type { Theme } from "@/lib/theme";
import { bucketOf, observe, usableSample, type TimingSample, type TimingStats } from "@/lib/timing";
import { db } from "./db";
import { HttpError } from "./http";

const MAX_LISTS = 100;
// Kept per account until the retention decision (#54).
const MAX_RUNS = 200;

async function transaction<T>(work: (client: pg.PoolClient) => Promise<T>, begin = "BEGIN") {
  const client = await db.connect();
  try {
    await client.query(begin);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
// Timestamps travel as milliseconds, like Date.now().
const ms = (column: string) => `(extract(epoch FROM ${column})*1000)::float8`;
// A word_reviews row as History (lib/learning.ts), FSRS state included (#2).
const HISTORY_COLUMNS = `correct, wrong, streak, ${ms("due_at")} AS due, stability, difficulty,
  state, learning_steps, lapses, scheduled_days, ${ms("last_review_at")} AS last_review`;
function historyOf(r: Record<string, unknown>): History {
  return {
    correct: r.correct as number,
    wrong: r.wrong as number,
    streak: r.streak as number,
    due: Math.round(r.due as number),
    stability: r.stability as number,
    difficulty: r.difficulty as number,
    state: r.state as History["state"],
    steps: r.learning_steps as number,
    lapses: r.lapses as number,
    scheduledDays: r.scheduled_days as number,
    lastReview: r.last_review === null ? null : Math.round(r.last_review as number),
  };
}

// The full user data dump, in the shape the client works with. One read-only snapshot, so
// lists, words, reviews and runs are consistent with each other.
export function loadWorkspace(userId: string) {
  return transaction(
    (c) => readWorkspace(c, userId),
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );
}
async function readWorkspace(c: pg.PoolClient, userId: string) {
  const profile = await c.query(
    "SELECT native_language, learning_language, theme, ai_enabled FROM users WHERE id=$1",
    [userId],
  );
  if (!profile.rowCount) throw new HttpError(404, "Account not found.");
  const lists = await c.query(
    `SELECT id, native_language, learning_language, title, description, revision
       FROM lists WHERE user_id=$1 ORDER BY created_at, id`,
    [userId],
  );
  const words = await c.query(
    "SELECT id, list_id, native_text FROM words WHERE user_id=$1 ORDER BY position",
    [userId],
  );
  const answers = await c.query(
    `SELECT word_id, learning_text FROM accepted_answers WHERE user_id=$1
       ORDER BY word_id, position`,
    [userId],
  );
  const reviews = await c.query(
    `SELECT word_id, prompt, ${HISTORY_COLUMNS} FROM word_reviews WHERE user_id=$1`,
    [userId],
  );
  const runs = await c.query(
    `SELECT id, list_id, title, mode, native_language, learning_language,
         ${ms("completed_at")} AS completed_at
       FROM runs WHERE user_id=$1 ORDER BY completed_at DESC, id LIMIT $2`,
    [userId, MAX_RUNS],
  );
  const results = await c.query(
    `SELECT run_id, word_id, native_text, learning_text, answer, correct, prompt,
         ${ms("answered_at")} AS answered_at
       FROM run_results WHERE run_id = ANY($1::uuid[]) ORDER BY run_id, position`,
    [runs.rows.map((r) => r.id)],
  );

  const history = new Map<string, History>();
  for (const r of reviews.rows) history.set(`${r.word_id}:${r.prompt}`, historyOf(r));
  const wordAnswers = new Map<string, string[]>();
  for (const a of answers.rows)
    wordAnswers.set(a.word_id, [...(wordAnswers.get(a.word_id) ?? []), a.learning_text]);
  const listWords = new Map<string, List["words"]>();
  for (const w of words.rows) {
    const entry = listWords.get(w.list_id) ?? [];
    const [back = "", ...accepted] = wordAnswers.get(w.id) ?? [];
    entry.push({
      id: w.id,
      front: w.native_text,
      back,
      ...(accepted.length ? { accepted } : {}),
      forward: history.get(`${w.id}:native`) ?? freshHistory(),
      reverse: history.get(`${w.id}:learning`) ?? freshHistory(),
    });
    listWords.set(w.list_id, entry);
  }
  const runResults = new Map<string, Run["results"]>();
  for (const r of results.rows) {
    const entry = runResults.get(r.run_id) ?? [];
    entry.push({
      // A deleted word keeps its text here; its id then matches nothing.
      word: { id: r.word_id ?? "", front: r.native_text, back: r.learning_text },
      answer: r.answer,
      correct: r.correct,
      direction: directionOf(r.prompt),
      answeredAt: Math.round(r.answered_at),
    });
    runResults.set(r.run_id, entry);
  }
  const data: WorkspaceData = {
    baseLanguage: profile.rows[0].native_language,
    learningLanguage: profile.rows[0].learning_language,
    theme: profile.rows[0].theme,
    aiEnabled: profile.rows[0].ai_enabled,
    lists: lists.rows.map((l) => ({
      id: l.id,
      title: l.title,
      description: l.description,
      from: l.native_language,
      to: l.learning_language,
      words: listWords.get(l.id) ?? [],
    })),
    runs: runs.rows.map((r) => ({
      id: r.id,
      listId: r.list_id ?? undefined,
      mode: r.mode,
      completedAt: Math.round(r.completed_at),
      title: r.title,
      from: r.native_language,
      to: r.learning_language,
      results: runResults.get(r.id) ?? [],
    })),
  };
  const listRevisions = Object.fromEntries(lists.rows.map((l) => [l.id, l.revision]));
  return { data, listRevisions };
}

// Deletes a list with its words, answers and review history. Completed sessions keep their
// copied text (list_id and word_id become null). A stale revision gets 409, as on save.
export function deleteList(userId: string, listId: string, revision: number) {
  return transaction(async (c) => {
    const deleted = await c.query("DELETE FROM lists WHERE id=$1 AND user_id=$2 AND revision=$3", [
      listId,
      userId,
      revision,
    ]);
    if (deleted.rowCount) return;
    const exists = await c.query("SELECT 1 FROM lists WHERE id=$1 AND user_id=$2", [
      listId,
      userId,
    ]);
    if (!exists.rowCount) throw new HttpError(404, "List not found.");
    throw new HttpError(409, "Another tab changed this list. Reload this tab before deleting it.");
  });
}

// Creates or replaces a list and its words. Words keep their review state while their id
// stays; removed words go with theirs. A stale revision gets 409, never an overwrite.
export function saveList(
  userId: string,
  listId: string,
  { revision, list }: z.infer<typeof listSaveSchema>,
) {
  return transaction(async (c) => {
    // One save at a time per account, so the list limit holds.
    await c.query("SELECT 1 FROM users WHERE id=$1 FOR UPDATE", [userId]);
    const fields = [listId, userId, list.from, list.to, list.title, list.description];
    let saved: number;
    if (revision === null) {
      const count = await c.query("SELECT count(*)::int AS n FROM lists WHERE user_id=$1", [
        userId,
      ]);
      if (count.rows[0].n >= MAX_LISTS)
        throw new HttpError(400, `This version supports up to ${MAX_LISTS} lists per account.`);
      const inserted = await c.query(
        `INSERT INTO lists(id, user_id, native_language, learning_language, title, description)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING RETURNING revision`,
        fields,
      );
      if (!inserted.rowCount) {
        // Another account's list id is treated as unknown, as on update.
        const own = await c.query("SELECT 1 FROM lists WHERE id=$1 AND user_id=$2", [
          listId,
          userId,
        ]);
        if (!own.rowCount) throw new HttpError(404, "List not found.");
        throw new HttpError(409, "This list already exists. Reload to see it.");
      }
      saved = inserted.rows[0].revision;
    } else {
      // A changed language pair reaches the copies on words and reviews through ON UPDATE
      // CASCADE.
      const updated = await c.query(
        `UPDATE lists SET native_language=$3, learning_language=$4, title=$5, description=$6,
           revision=revision+1, updated_at=now()
         WHERE id=$1 AND user_id=$2 AND revision=$7 RETURNING revision`,
        [...fields, revision],
      );
      if (!updated.rowCount) {
        const exists = await c.query("SELECT 1 FROM lists WHERE id=$1 AND user_id=$2", [
          listId,
          userId,
        ]);
        if (!exists.rowCount) throw new HttpError(404, "List not found.");
        throw new HttpError(
          409,
          "Another tab changed this list. Export any unsaved words, then reload this tab.",
        );
      }
      saved = updated.rows[0].revision;
    }
    const ids = list.words.map((w) => w.id);
    await c.query("DELETE FROM words WHERE list_id=$1 AND NOT (id = ANY($2::uuid[]))", [
      listId,
      ids,
    ]);
    const words = await c.query(
      `INSERT INTO words (id, list_id, user_id, native_language, learning_language, native_text,
         position)
       SELECT w.id, $1, $2, $3, $4, w.native_text, w.position
       FROM unnest($5::uuid[], $6::text[]) WITH ORDINALITY AS w(id, native_text, position)
       ON CONFLICT (id) DO UPDATE SET native_text=EXCLUDED.native_text,
         position=EXCLUDED.position
       WHERE words.list_id = EXCLUDED.list_id
       RETURNING id`,
      [listId, userId, list.from, list.to, ids, list.words.map((w) => w.front)],
    );
    // A word id that belongs to another list (or account) isn't taken over.
    if (words.rowCount !== ids.length)
      throw new HttpError(409, "Some words belong to another list. Reload this tab.");
    // The answers are rewritten with their words: the primary answer at position 0, then the
    // further accepted ones. An answer with the same key as an earlier one is left out.
    const answers = list.words.flatMap((w) =>
      [w.back, ...w.accepted].map((text, position) => ({ id: w.id, position, text })),
    );
    await c.query("DELETE FROM accepted_answers WHERE word_id = ANY($1::uuid[])", [ids]);
    await c.query(
      `INSERT INTO accepted_answers (word_id, position, user_id, native_language,
         learning_language, learning_text)
       SELECT DISTINCT ON (a.word_id, vocabulary_key(a.learning_text))
         a.word_id, a.position, $1, $2, $3, a.learning_text
       FROM unnest($4::uuid[], $5::int[], $6::text[]) AS a(word_id, position, learning_text)
       ORDER BY a.word_id, vocabulary_key(a.learning_text), a.position`,
      [
        userId,
        list.from,
        list.to,
        answers.map((a) => a.id),
        answers.map((a) => a.position),
        answers.map((a) => a.text),
      ],
    );
    return { revision: saved };
  });
}

// Applies one checked answer with the server's clock and returns the word's new state.
// Concurrent answers for the same word wait for each other on the row lock, so every answer
// counts; an answer whose id was already applied (a retried request) changes nothing.
export function recordReview(
  userId: string,
  { id, wordId, direction, correct, timing }: z.infer<typeof reviewSchema>,
) {
  return transaction(async (c) => {
    const word = await c.query(
      "SELECT native_language, learning_language FROM words WHERE id=$1 AND user_id=$2 FOR SHARE",
      [wordId, userId],
    );
    if (!word.rowCount) throw new HttpError(404, "That word no longer exists.");
    const prompt = promptOf(direction);
    const { native_language, learning_language } = word.rows[0];
    await c.query(
      `INSERT INTO word_reviews (word_id, prompt, user_id, native_language, learning_language)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
      [wordId, prompt, userId, native_language, learning_language],
    );
    const current = await c.query(
      `SELECT ${HISTORY_COLUMNS} FROM word_reviews WHERE word_id=$1 AND prompt=$2 FOR UPDATE`,
      [wordId, prompt],
    );
    const history = historyOf(current.rows[0]);
    const event = await c.query(
      `INSERT INTO review_events (id, user_id, word_id, prompt, correct) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO NOTHING`,
      [id, userId, wordId, prompt, correct],
    );
    if (!event.rowCount) return history;
    const next = reviewed(history, correct, Date.now());
    await c.query(
      `UPDATE word_reviews SET correct=$3, wrong=$4, streak=$5, due_at=to_timestamp($6/1000.0),
         stability=$7, difficulty=$8, state=$9, learning_steps=$10, lapses=$11,
         scheduled_days=$12, last_review_at=to_timestamp($13/1000.0)
       WHERE word_id=$1 AND prompt=$2`,
      [
        wordId,
        prompt,
        next.correct,
        next.wrong,
        next.streak,
        next.due,
        next.stability,
        next.difficulty,
        next.state,
        next.steps,
        next.lapses,
        next.scheduledDays,
        next.lastReview,
      ],
    );
    if (correct && timing && usableSample(timing)) await recordTiming(c, userId, timing);
    return next;
  });
}

// Adds one answer's hesitation to the account's running averages for its input type, and
// its score (once the account has a usual to compare with) to the site-wide counts (#2).
async function recordTiming(c: pg.PoolClient, userId: string, sample: TimingSample) {
  await c.query(
    "INSERT INTO answer_timing (user_id, input) VALUES ($1,$2) ON CONFLICT DO NOTHING",
    [userId, sample.input],
  );
  const row = (
    await c.query(
      "SELECT samples, mean, variance FROM answer_timing WHERE user_id=$1 AND input=$2 FOR UPDATE",
      [userId, sample.input],
    )
  ).rows[0] as TimingStats;
  const { stats, z } = observe(row, sample);
  await c.query(
    `UPDATE answer_timing SET samples=$3, mean=$4, variance=$5, updated_at=now()
     WHERE user_id=$1 AND input=$2`,
    [userId, sample.input, stats.samples, stats.mean, stats.variance],
  );
  if (z !== null)
    await c.query(
      `INSERT INTO answer_timing_buckets (input, bucket, answers) VALUES ($1,$2,1)
       ON CONFLICT (input, bucket) DO UPDATE SET answers = answer_timing_buckets.answers + 1`,
      [sample.input, bucketOf(z)],
    );
}

// Saves a completed session once (a retried request changes nothing) and keeps the newest
// MAX_RUNS. Results link to words that still exist and keep their text either way.
export function addRun(userId: string, run: z.infer<typeof runSaveSchema>) {
  return transaction(async (c) => {
    // One session save at a time per account, so the MAX_RUNS limit holds across tabs.
    await c.query("SELECT 1 FROM users WHERE id=$1 FOR UPDATE", [userId]);
    const inserted = await c.query(
      `INSERT INTO runs (id, user_id, native_language, learning_language, list_id, title, mode,
         completed_at)
       VALUES ($1,$2,$3,$4,(SELECT id FROM lists WHERE id=$5 AND user_id=$2),$6,$7,
         to_timestamp($8/1000.0))
       ON CONFLICT (id) DO NOTHING`,
      [run.id, userId, run.from, run.to, run.listId, run.title, run.mode, run.completedAt],
    );
    if (!inserted.rowCount) return;
    const r = run.results;
    await c.query(
      `INSERT INTO run_results (run_id, position, user_id, native_language, learning_language,
         word_id, list_id, prompt, native_text, learning_text, answer, correct, answered_at)
       SELECT $1, r.position, $2, $3, $4, w.id, w.list_id, r.prompt, r.native_text,
         r.learning_text, r.answer, r.correct, to_timestamp(r.answered_at/1000.0)
       FROM unnest($5::uuid[], $6::text[], $7::text[], $8::text[], $9::text[], $10::boolean[],
         $11::float8[]) WITH ORDINALITY
         AS r(word_id, prompt, native_text, learning_text, answer, correct, answered_at,
           position)
       LEFT JOIN words w ON w.id = r.word_id AND w.user_id = $2`,
      [
        run.id,
        userId,
        run.from,
        run.to,
        r.map((x) => x.word.id),
        r.map((x) => promptOf(x.direction)),
        r.map((x) => x.word.front),
        r.map((x) => x.word.back),
        r.map((x) => x.answer),
        r.map((x) => x.correct),
        r.map((x) => x.answeredAt),
      ],
    );
    await c.query(
      `DELETE FROM runs WHERE id IN (SELECT id FROM runs WHERE user_id=$1
         ORDER BY completed_at DESC, id OFFSET $2)`,
      [userId, MAX_RUNS],
    );
  });
}

export async function saveProfile(userId: string, profile: z.infer<typeof profileSchema>) {
  await db.query("UPDATE users SET native_language=$2, learning_language=$3 WHERE id=$1", [
    userId,
    profile.baseLanguage,
    profile.learningLanguage,
  ]);
}

export async function saveTheme(userId: string, theme: Theme) {
  await db.query("UPDATE users SET theme=$2 WHERE id=$1", [userId, theme]);
}

export async function saveAiEnabled(userId: string, enabled: boolean) {
  await db.query("UPDATE users SET ai_enabled=$2 WHERE id=$1", [userId, enabled]);
}

// One of this account's words, for an AI call (#82): its native text, languages and accepted
// answers (primary first). Null for a word that isn't this account's, or no longer exists.
export async function readWordForAi(userId: string, wordId: string): Promise<AiWord | null> {
  const { rows } = await db.query(
    `SELECT w.native_text, w.native_language, w.learning_language,
       array_agg(a.learning_text ORDER BY a.position) AS answers
     FROM words w JOIN accepted_answers a ON a.word_id = w.id
     WHERE w.id = $1 AND w.user_id = $2
     GROUP BY w.id`,
    [wordId, userId],
  );
  const row = rows[0];
  return row
    ? {
        native: row.native_text,
        baseLanguage: row.native_language,
        learningLanguage: row.learning_language,
        answers: row.answers,
      }
    : null;
}

// Everything the data export (#10) needs, from one read-only snapshot: the workspace, the
// account row, its answer log (review_events) and its AI usage records (kind, letters and
// time; never text).
export function loadExport(userId: string) {
  return transaction(async (c) => {
    const { data } = await readWorkspace(c, userId);
    const account = await c.query(
      "SELECT email, created_at, ai_tier, last_sign_in_at FROM users WHERE id=$1",
      [userId],
    );
    const events = await c.query(
      `SELECT word_id, prompt, correct, reviewed_at FROM review_events WHERE user_id=$1
       ORDER BY reviewed_at, id`,
      [userId],
    );
    const usage = await c.query(
      "SELECT kind, letters, at FROM ai_usage WHERE user_id=$1 ORDER BY at, kind",
      [userId],
    );
    const timing = await c.query(
      "SELECT input, samples, mean, variance FROM answer_timing WHERE user_id=$1 ORDER BY input",
      [userId],
    );
    const row = account.rows[0];
    const exported: ExportSource = {
      data,
      account: {
        email: row.email,
        createdAt: row.created_at,
        accountType: row.ai_tier,
        lastSignInAt: row.last_sign_in_at,
      },
      reviewEvents: events.rows.map((e) => ({
        wordId: e.word_id,
        direction: directionOf(e.prompt),
        correct: e.correct,
        at: e.reviewed_at,
      })),
      aiUsage: usage.rows.map((u) => ({ kind: u.kind, letters: u.letters, at: u.at })),
      answerTiming: timing.rows.map((t) => ({
        input: t.input,
        samples: t.samples,
        mean: t.mean,
        variance: t.variance,
      })),
    };
    return exported;
  }, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
}
