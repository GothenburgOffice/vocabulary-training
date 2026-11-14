import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api } from "./helpers.mts";

test("real HTTP: answer timing is kept only as averages, and admin sees site-wide counts", async () => {
  const reg = await api("/api/auth", "POST", {
    action: "register",
    email: `timing-${randomUUID()}@example.test`,
    password: "integration-test-only-password",
  });
  assert.equal(reg.status, 200, await reg.clone().text());
  const cookie = reg.headers.get("set-cookie")!.split(";")[0];
  const workspace = await (await api("/api/workspace", "GET", undefined, cookie)).json();
  assert.deepEqual(Object.keys(workspace.timingCutoffs).sort(), ["keyboard", "touch"]);
  const listId = randomUUID();
  const wordId = randomUUID();
  const created = await api(
    `/api/lists/${listId}`,
    "PUT",
    {
      revision: null,
      list: {
        title: "Timing",
        description: "",
        from: "Swedish",
        to: "French",
        words: [{ id: wordId, front: "hej", back: "bonjour" }],
      },
    },
    cookie,
  );
  assert.equal(created.status, 200, await created.clone().text());
  const review = (correct: boolean, timing: object, id = randomUUID()) =>
    api("/api/reviews", "POST", { id, wordId, direction: "forward", correct, timing }, cookie);
  const timing = { input: "keyboard", activeMs: 3000, beforeMs: 1200, pauseMs: 300 };
  // Only a right answer is timed, and only in the expected shape.
  assert.equal((await review(false, timing)).status, 400);
  assert.equal((await review(true, { ...timing, input: "mouse" })).status, 400);
  const id = randomUUID();
  assert.equal((await review(true, timing, id)).status, 200);
  // A retried answer counts once; a walked-away one isn't counted; touch is kept apart.
  assert.equal((await review(true, timing, id)).status, 200);
  assert.equal((await review(true, { ...timing, activeMs: 300_000 })).status, 200);
  assert.equal((await review(true, { ...timing, input: "touch" })).status, 200);
  const exported = await (await api("/api/export", "GET", undefined, cookie)).json();
  assert.deepEqual(
    exported.answerTiming.map((t: { input: string; answers: number }) => [t.input, t.answers]),
    [
      ["keyboard", 1],
      ["touch", 1],
    ],
  );
  assert.ok(exported.answerTiming[0].usualScore > 0);
  assert.equal(exported.answerTiming[0].spread, 0);

  // The admin section: 404 to learners; settings checked, saved and restored.
  assert.equal((await api("/api/admin/timing", "GET", undefined, cookie)).status, 404);
  const adminEmail = process.env.TEST_ADMIN_EMAIL;
  const adminPassword = process.env.TEST_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return;
  const login = await api("/api/auth", "POST", {
    action: "login",
    email: adminEmail,
    password: adminPassword,
  });
  const admin = login.headers.get("set-cookie")!.split(";")[0];
  const before = await (await api("/api/admin/timing", "GET", undefined, admin)).json();
  assert.ok(before.summary.keyboard.answers >= 1);
  assert.ok(Array.isArray(before.summary.touch.buckets));
  assert.equal(JSON.stringify(before.summary).includes(wordId), false);
  const put = (settings: unknown) => api("/api/admin/timing", "PUT", settings, admin);
  try {
    assert.equal((await put({ ...before.settings, hardThreshold: 2.3 })).status, 400);
    assert.equal(
      (await put({ ...before.settings, cutoffMs: { keyboard: 50, touch: 1500 } })).status,
      400,
    );
    assert.equal(
      (
        await api("/api/admin/timing", "PUT", before.settings, admin, {
          Origin: "https://attacker.invalid",
        })
      ).status,
      403,
    );
    const changed = { cutoffMs: { keyboard: 1200, touch: 1800 }, hardThreshold: 2.5 };
    const saved = await put(changed);
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.deepEqual((await saved.json()).settings, changed);
    const again = await (await api("/api/workspace", "GET", undefined, cookie)).json();
    assert.deepEqual(again.timingCutoffs, changed.cutoffMs);
  } finally {
    await put(before.settings);
  }
});
