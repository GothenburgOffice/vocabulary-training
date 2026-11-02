import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  createReport,
  pruneReports,
  readRecentActivity,
  readReports,
  recordActivity,
} from "../lib/server/activity-reports.ts";
import { db } from "../lib/server/db.ts";

// Explicit opt-in on an isolated database: this exercises retention and account deletion.
test(
  "PostgreSQL reports: ownership, retention, snapshots, duplicate races and account deletion",
  { skip: process.env.TEST_REPORTS_DATABASE !== "1" },
  async (t) => {
    const user = randomUUID();
    const other = randomUUID();
    t.after(async () => {
      await db.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [[user, other]]);
      await db.end();
    });
    for (const id of [user, other])
      await db.query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'unused')", [
        id,
        `reports-${id}@example.test`,
      ]);
    const input = {
      kind: "speech" as const,
      word: "bonjour",
      language: "French",
      model: "synthetic/tts",
      voice: "test-voice",
      tier: "basic",
    };
    await recordActivity(user, input);
    const [first] = await readRecentActivity(user);
    assert.deepEqual(
      { ...first, id: undefined, createdAt: undefined },
      { ...input, id: undefined, createdAt: undefined },
    );
    assert.match(first.id, /^[\da-f-]{36}$/);
    assert.ok(Number.isFinite(Date.parse(first.createdAt)));
    assert.deepEqual(await readRecentActivity(other), []);
    await assert.rejects(createReport(other, first.id, "other"), { status: 404 });
    await assert.rejects(createReport(user, randomUUID(), "other"), { status: 404 });

    // Two tabs may report once, not overwrite the reason or create duplicate snapshots.
    const attempts = await Promise.allSettled([
      createReport(user, first.id, "pronunciation"),
      createReport(user, first.id, "pronunciation"),
    ]);
    assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
    const rejected = attempts.find((a) => a.status === "rejected");
    assert.equal(rejected?.reason.status, 409);
    const saved = attempts.find((a) => a.status === "fulfilled")!.value;
    assert.deepEqual(saved.activity, first);
    assert.equal(saved.reason, "pronunciation");
    assert.notEqual(saved.id, first.id);

    await recordActivity(other, input);
    const [others] = await readRecentActivity(other);
    await db.query(
      "UPDATE ai_activity SET created_at = now() - interval '61 minutes' WHERE user_id = ANY($1::uuid[])",
      [[user, other]],
    );
    assert.deepEqual(await readRecentActivity(user), []);
    await assert.rejects(createReport(other, others.id, "other"), { status: 404 });
    await recordActivity(user, { ...input, kind: "note", model: "synthetic/note", voice: null });
    // Recording prunes only the recording account. A report remains intact without its log.
    assert.equal(
      (await db.query("SELECT 1 FROM ai_activity WHERE id = $1", [first.id])).rowCount,
      0,
    );
    assert.equal(
      (await db.query("SELECT 1 FROM ai_activity WHERE id = $1", [others.id])).rowCount,
      1,
    );
    assert.deepEqual(
      (await readReports()).find((r) => r.id === saved.id),
      saved,
    );
    const [note] = await readRecentActivity(user);
    const noteReport = await createReport(user, note.id, "incorrect-note");
    assert.equal(noteReport.activity.voice, null);
    assert.equal(noteReport.activity.kind, "note");

    // Recent results are bounded even when cached clips are played repeatedly.
    await db.query(
      `INSERT INTO ai_activity (id, user_id, kind, word, language, model, voice, tier)
       SELECT gen_random_uuid(), $1, 'speech', 'word', 'French', 'synthetic/tts', NULL, 'basic'
       FROM generate_series(1, 105)`,
      [user],
    );
    assert.equal((await readRecentActivity(user)).length, 100);
    await db.query(
      "UPDATE issue_reports SET created_at = now() - interval '16 days' WHERE id = $1",
      [saved.id],
    );
    assert.equal(await pruneReports(), 1);
    assert.ok((await readReports()).some((r) => r.id === noteReport.id));
    await db.query(
      `INSERT INTO issue_reports
         (id, user_id, activity_id, reason, kind, word, language, model, voice, tier,
          activity_created_at)
       SELECT gen_random_uuid(), $1, gen_random_uuid(), 'other', 'note', 'word', 'French',
              'synthetic/note', NULL, 'basic', now()
       FROM generate_series(1, 205)`,
      [user],
    );
    const bounded = await readReports();
    assert.equal(bounded.length, 200);
    assert.equal("user_id" in bounded[0], false);
    await db.query("DELETE FROM users WHERE id = $1", [user]);
    for (const table of ["ai_activity", "issue_reports"])
      assert.equal(
        (await db.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [user])).rowCount,
        0,
      );
  },
);
