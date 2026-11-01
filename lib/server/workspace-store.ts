import "server-only";
import type pg from "pg";
import type { z } from "zod";
import {
  directionOf,
  freshHistory,
  learningKey,
  promptOf,
  reviewed,
  type History,
  type List,
} from "../learning";
import type { listSaveSchema, profileSchema, reviewSchema, runSaveSchema } from "../validation";
import type { Run, WorkspaceData } from "../workspace";
import { db } from "./db";
import { HttpError } from "./http";

export const MAX_LISTS = 100;
// Kept per account until the retention decision (#54).
export const MAX_RUNS = 200;

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

// The full user data dump, in the shape the client works with. One read-only snapshot, so
// lists, words, reviews and runs are consistent with each other.
export function loadWorkspace(userId: string) {
  return transaction(async (c) => {
    const profile = await c.query(
      "SELECT native_language, learning_language FROM users WHERE id=$1",
      [userId],
    );
    if (!profile.rowCount) throw new HttpError(404, "Account not found.");
    const lists = await c.query(
      `SELECT id, native_language, learning_language, title, description, revision
       FROM lists WHERE user_id=$1 ORDER BY created_at, id`,
      [userId],
    );
    const words = await c.query(
      "SELECT id, list_id, native_text, learning_text FROM words WHERE user_id=$1 ORDER BY position",
      [userId],
    );
    const reviews = await c.query(
      `SELECT word_id, prompt, correct, wrong, streak, ${ms("due_at")} AS due
       FROM word_reviews WHERE user_id=$1`,
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
    for (const r of reviews.rows)
      history.set(`${r.word_id}:${r.prompt}`, {
        correct: r.correct,
        wrong: r.wrong,
        streak: r.streak,
        due: Math.round(r.due),
      });
    const listWords = new Map<string, List["words"]>();
    for (const w of words.rows) {
      const entry = listWords.get(w.list_id) ?? [];
      entry.push({
        id: w.id,
        front: w.native_text,
        back: w.learning_text,
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
  }, "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
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
      if (!inserted.rowCount)
        throw new HttpError(409, "This list already exists. Reload to see it.");
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
      `INSERT INTO words (id, list_id, user_id, native_language, learning_language,
         native_text, learning_text, learning_key, position)
       SELECT w.id, $1, $2, $3, $4, w.native_text, w.learning_text, w.learning_key, w.position
       FROM unnest($5::uuid[], $6::text[], $7::text[], $8::text[]) WITH ORDINALITY
         AS w(id, native_text, learning_text, learning_key, position)
       ON CONFLICT (id) DO UPDATE SET native_text=EXCLUDED.native_text,
         learning_text=EXCLUDED.learning_text, learning_key=EXCLUDED.learning_key,
         position=EXCLUDED.position
       WHERE words.list_id = EXCLUDED.list_id
       RETURNING id`,
      [
        listId,
        userId,
        list.from,
        list.to,
        ids,
        list.words.map((w) => w.front),
        list.words.map((w) => w.back),
        list.words.map((w) => learningKey(w.back)),
      ],
    );
    // A word id that belongs to another list (or account) isn't taken over.
    if (words.rowCount !== ids.length)
      throw new HttpError(409, "Some words belong to another list. Reload this tab.");
    return { revision: saved };
  });
}

// Applies one checked answer with the server's clock. Concurrent answers for the same word
// wait for each other on the row lock, so every answer counts.
export function recordReview(
  userId: string,
  { wordId, direction, correct }: z.infer<typeof reviewSchema>,
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
      `SELECT correct, wrong, streak, ${ms("due_at")} AS due FROM word_reviews
       WHERE word_id=$1 AND prompt=$2 FOR UPDATE`,
      [wordId, prompt],
    );
    const row = current.rows[0];
    const next = reviewed(
      { correct: row.correct, wrong: row.wrong, streak: row.streak, due: Math.round(row.due) },
      correct,
      Date.now(),
    );
    await c.query(
      `UPDATE word_reviews SET correct=$3, wrong=$4, streak=$5, due_at=to_timestamp($6/1000.0)
       WHERE word_id=$1 AND prompt=$2`,
      [wordId, prompt, next.correct, next.wrong, next.streak, next.due],
    );
    return next;
  });
}

// Saves a completed session once (a retried request changes nothing) and keeps the newest
// MAX_RUNS. Results link to words that still exist and keep their text either way.
export function addRun(userId: string, run: z.infer<typeof runSaveSchema>) {
  return transaction(async (c) => {
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
         word_id, list_id, prompt, native_text, learning_text, learning_key, answer, correct,
         answered_at)
       SELECT $1, r.position, $2, $3, $4, w.id, w.list_id, r.prompt, r.native_text,
         r.learning_text, r.learning_key, r.answer, r.correct, to_timestamp(r.answered_at/1000.0)
       FROM unnest($5::uuid[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[],
         $11::boolean[], $12::float8[]) WITH ORDINALITY
         AS r(word_id, prompt, native_text, learning_text, learning_key, answer, correct,
           answered_at, position)
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
        r.map((x) => learningKey(x.word.back)),
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
