import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api } from "./helpers.mts";

test("real HTTP: the data export downloads only this account's data, as JSON", async () => {
  assert.equal((await api("/api/export")).status, 401);
  const register = async (prefix: string) => {
    const reg = await api("/api/auth", "POST", {
      action: "register",
      email: `${prefix}-${randomUUID()}@example.test`,
      password: "integration-test-only-password",
    });
    assert.equal(reg.status, 200, await reg.clone().text());
    return reg.headers.get("set-cookie")!.split(";")[0];
  };
  const [cookie, other] = [await register("export"), await register("export-other")];
  const saveList = (who: string, title: string, wordId: string) =>
    api(
      `/api/lists/${randomUUID()}`,
      "PUT",
      {
        revision: null,
        list: {
          title,
          description: "",
          from: "Swedish",
          to: "French",
          words: [{ id: wordId, front: "katt", back: "chat", accepted: ["minou"] }],
        },
      },
      who,
    );
  const wordId = randomUUID();
  assert.equal((await saveList(cookie, "Mine", wordId)).status, 200);
  assert.equal((await saveList(other, "Not mine", randomUUID())).status, 200);
  const review = { id: randomUUID(), wordId, direction: "forward", correct: true };
  assert.equal((await api("/api/reviews", "POST", review, cookie)).status, 200);
  const run = {
    id: randomUUID(),
    listId: null,
    title: "Mine",
    mode: "adaptive",
    from: "Swedish",
    to: "French",
    completedAt: Date.now(),
    results: [
      {
        word: { id: wordId, front: "katt", back: "chat" },
        answer: "chat",
        correct: true,
        direction: "forward",
        answeredAt: Date.now(),
      },
    ],
  };
  assert.equal((await api("/api/runs", "POST", run, cookie)).status, 200);

  const res = await api("/api/export", "GET", undefined, cookie);
  assert.equal(res.status, 200, await res.clone().text());
  assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
  assert.match(
    res.headers.get("content-disposition") ?? "",
    /^attachment; filename="vocabulary-training-export-\d{4}-\d{2}-\d{2}\.json"$/,
  );
  assert.equal(res.headers.get("cache-control"), "no-store");
  const doc = await res.json();
  assert.equal(doc.version, 5);
  assert.match(doc.account.email, /^export-/);
  assert.deepEqual(
    doc.lists.map((l: { title: string }) => l.title),
    ["Mine"],
  );
  const word = doc.lists[0].words[0];
  assert.deepEqual(word.answers, ["chat", "minou"]);
  assert.equal(word.review.forward.correct, 1);
  assert.equal(word.answerLog.length, 1);
  assert.deepEqual(
    { direction: word.answerLog[0].direction, correct: word.answerLog[0].correct },
    { direction: "forward", correct: true },
  );
  assert.ok(Date.parse(word.review.forward.due) > Date.now());
  assert.equal(word.review.reverse.due, null);
  assert.equal(word.review.forward.fsrs.state, "learning");
  assert.equal(word.review.reverse.fsrs.state, "new");
  assert.equal(doc.sessions.length, 1);
  assert.equal(doc.sessions[0].results[0].answer, "chat");
  assert.deepEqual(doc.aiUsage, []);
  // Nothing that identifies the account internally, or a session.
  const text = JSON.stringify(doc);
  assert.ok(!text.includes(cookie.split("=")[1]));
  assert.ok(!/password|token|user_?id/i.test(text));
});
