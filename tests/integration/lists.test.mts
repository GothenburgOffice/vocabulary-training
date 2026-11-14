import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api } from "./helpers.mts";

test("real HTTP: lists, reviews, sessions and the profile are saved as rows", async () => {
  const reg = await api("/api/auth", "POST", {
    action: "register",
    email: `rows-${randomUUID()}@example.test`,
    password: "integration-test-only-password",
  });
  assert.equal(reg.status, 200, await reg.clone().text());
  const cookie = reg.headers.get("set-cookie")!.split(";")[0];
  const listId = randomUUID();
  const [kept, removed] = [randomUUID(), randomUUID()];
  type Pair = { id: string; front: string; back: string; accepted?: string[] };
  const list = (words: Pair[], to = "French") => ({
    title: "Rows",
    description: "Integration",
    from: "Swedish",
    to,
    words,
  });
  // "Minou" and " CHAT " repeat earlier answers by key, so they are left out.
  const words = [
    { id: kept, front: "katt", back: "chat", accepted: ["minou", "Minou", " CHAT "] },
    { id: removed, front: "hund", back: "chien" },
  ];
  const put = (revision: number | null, data: object) =>
    api(`/api/lists/${listId}`, "PUT", { revision, list: data }, cookie);
  assert.equal((await put(null, list(words))).status, 200);

  // Two tabs answering the same word at once: every answer counts.
  const review = (wordId: string, correct: boolean, id = randomUUID()) =>
    api("/api/reviews", "POST", { id, wordId, direction: "forward", correct }, cookie);
  const answers = await Promise.all([review(kept, true), review(kept, true), review(kept, false)]);
  assert.deepEqual(
    answers.map((a) => a.status),
    [200, 200, 200],
  );
  // A retried answer (same id, its response lost) is counted once.
  const retried = randomUUID();
  const first = await (await review(kept, true, retried)).json();
  const again = await review(kept, true, retried);
  assert.equal(again.status, 200);
  assert.deepEqual((await again.json()).history, first.history);
  const load = async () =>
    (await (await api("/api/workspace", "GET", undefined, cookie)).json()).data;
  let dump = await load();
  const history = dump.lists[0].words[0].forward;
  assert.equal(history.correct + history.wrong, 4);
  assert.equal(history.wrong, 1);
  assert(history.due > Date.now());
  // FSRS state is saved with the counts (#2). The three answers may be applied in any order,
  // so the state is any but new.
  assert.ok(["learning", "review", "relearning"].includes(history.state), history.state);
  assert.ok(history.stability > 0 && history.difficulty > 0);
  assert.ok(Math.abs(history.lastReview - Date.now()) < 60_000);
  assert.deepEqual(dump.lists[0].words[0].reverse, {
    correct: 0,
    wrong: 0,
    streak: 0,
    due: 0,
    stability: 0,
    difficulty: 0,
    state: "new",
    steps: 0,
    lapses: 0,
    scheduledDays: 0,
    lastReview: null,
  });
  assert.equal(dump.lists[0].words[0].back, "chat");
  assert.deepEqual(dump.lists[0].words[0].accepted, ["minou"]);
  assert.equal(dump.lists[0].words[1].accepted, undefined);

  // A session keeps the text it practised, also for words removed afterwards.
  const run = {
    id: randomUUID(),
    listId,
    title: "Rows",
    mode: "adaptive",
    from: "Swedish",
    to: "French",
    completedAt: Date.now(),
    results: words.map((w, i) => ({
      word: w,
      answer: i ? "wrong" : w.back,
      correct: !i,
      direction: "forward",
      answeredAt: Date.now(),
    })),
  };
  assert.equal((await api("/api/runs", "POST", run, cookie)).status, 200);
  // A retried request doesn't save the session twice.
  assert.equal((await api("/api/runs", "POST", run, cookie)).status, 200);
  // Changing the target language and removing a word: the pair follows to the kept word.
  const changed = await put(1, list([words[0]], "Italian"));
  assert.equal(changed.status, 200, await changed.clone().text());
  assert.equal((await review(removed, true)).status, 404);
  const profile = (learningLanguage: string) =>
    api("/api/profile", "PATCH", { baseLanguage: "Swedish", learningLanguage }, cookie);
  assert.equal((await profile("Italian")).status, 200);
  assert.equal((await profile("Swedish")).status, 400);

  dump = await load();
  assert.equal(dump.learningLanguage, "Italian");
  assert.equal(dump.lists[0].to, "Italian");
  assert.deepEqual(
    dump.lists[0].words.map((w: Pair) => w.id),
    [kept],
  );
  // The accepted answers followed the word to the new language pair.
  assert.deepEqual(dump.lists[0].words[0].accepted, ["minou"]);
  const kept_ = dump.lists[0].words[0].forward;
  assert.equal(kept_.correct + kept_.wrong, 4);
  assert.equal(dump.runs.length, 1);
  assert.equal(dump.runs[0].to, "French");
  assert.deepEqual(
    dump.runs[0].results.map((r: { word: Pair; correct: boolean }) => [
      r.word.id,
      r.word.back,
      r.correct,
    ]),
    [
      [kept, "chat", true],
      ["", "chien", false],
    ],
  );
});

test("real HTTP: deleting a list removes its words and keeps completed sessions", async () => {
  const register = async (name: string) => {
    const reg = await api("/api/auth", "POST", {
      action: "register",
      email: `${name}-${randomUUID()}@example.test`,
      password: "integration-test-only-password",
    });
    assert.equal(reg.status, 200, await reg.clone().text());
    return reg.headers.get("set-cookie")!.split(";")[0];
  };
  const [cookie, other] = [await register("delete"), await register("delete-other")];
  const listId = randomUUID();
  const word = { id: randomUUID(), front: "katt", back: "chat" };
  const list = { title: "Doomed", description: "", from: "Swedish", to: "French", words: [word] };
  const put = (revision: number | null) =>
    api(`/api/lists/${listId}`, "PUT", { revision, list }, cookie);
  const remove = (data: unknown, who = cookie, extra = {}) =>
    api(`/api/lists/${listId}`, "DELETE", data, who, extra);
  assert.equal((await put(null)).status, 200);
  const run = {
    id: randomUUID(),
    listId,
    title: "Doomed",
    mode: "adaptive",
    from: "Swedish",
    to: "French",
    completedAt: Date.now(),
    results: [
      { word, answer: "chat", correct: true, direction: "forward", answeredAt: Date.now() },
    ],
  };
  assert.equal((await api("/api/runs", "POST", run, cookie)).status, 200);
  assert.equal((await put(1)).status, 200);

  // Changed in another tab since revision 1: refused, like a stale save.
  assert.equal((await remove({ revision: 1 })).status, 409);
  assert.equal((await remove({})).status, 400);
  assert.equal((await remove({ revision: 2 }, other)).status, 404);
  // Nor can it delete another account's list, which stays.
  const othersId = randomUUID();
  const othersList = { ...list, words: [{ ...word, id: randomUUID() }] };
  const othersPut = await api(
    `/api/lists/${othersId}`,
    "PUT",
    { revision: null, list: othersList },
    other,
  );
  assert.equal(othersPut.status, 200);
  assert.equal(
    (await api(`/api/lists/${othersId}`, "DELETE", { revision: 1 }, cookie)).status,
    404,
  );
  const othersData = (await (await api("/api/workspace", "GET", undefined, other)).json()).data;
  assert.deepEqual(
    othersData.lists.map((l: { id: string }) => l.id),
    [othersId],
  );
  assert.equal(
    (await remove({ revision: 2 }, cookie, { Origin: "https://attacker.invalid" })).status,
    403,
  );
  assert.equal((await remove({ revision: 2 })).status, 200);
  assert.equal((await remove({ revision: 2 })).status, 404);
  assert.equal((await put(2)).status, 404);
  const review = { id: randomUUID(), wordId: word.id, direction: "forward", correct: true };
  assert.equal((await api("/api/reviews", "POST", review, cookie)).status, 404);

  // While being written, a list may have no name and no words yet (#67, migration 006).
  const draftId = randomUUID();
  const draft = { ...list, title: "", words: [] };
  const savedDraft = await api(
    `/api/lists/${draftId}`,
    "PUT",
    { revision: null, list: draft },
    cookie,
  );
  assert.equal(savedDraft.status, 200, await savedDraft.clone().text());
  assert.equal((await api(`/api/lists/${draftId}`, "DELETE", { revision: 1 }, cookie)).status, 200);

  const dump = (await (await api("/api/workspace", "GET", undefined, cookie)).json()).data;
  assert.equal(dump.lists.length, 0);
  assert.equal(dump.runs.length, 1);
  assert.equal(dump.runs[0].listId, undefined);
  assert.deepEqual(
    dump.runs[0].results.map((r: { word: { front: string; back: string } }) => r.word),
    [{ id: "", front: "katt", back: "chat" }],
  );
});
