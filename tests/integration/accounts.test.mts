import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api } from "./helpers.mts";

test("real HTTP and PostgreSQL: accounts, ownership, persistence, conflicts, CSRF and logout", async () => {
  const password = "integration-test-only-password";
  const email = `integration-${randomUUID()}@example.test`;
  assert.equal((await api("/api/workspace")).status, 401);
  assert.equal((await api("/api/health")).status, 200);
  assert.match(
    (await api("/api/health")).headers.get("content-security-policy") ?? "",
    /media-src 'self' blob:/,
  );
  const someWord = { wordId: randomUUID(), part: "native" };
  assert.equal((await api("/api/speech", "POST", someWord)).status, 401);
  const reg = await api("/api/auth", "POST", { action: "register", email, password });
  assert.equal(reg.status, 200, await reg.clone().text());
  const rawCookie = reg.headers.get("set-cookie")!;
  assert(rawCookie.includes("HttpOnly"));
  assert(rawCookie.includes("SameSite=strict"));
  const cookie = rawCookie.split(";")[0];
  const first = await (await api("/api/workspace", "GET", undefined, cookie)).json();
  assert.equal(
    (
      await api("/api/speech", "POST", someWord, cookie, {
        Origin: "https://attacker.invalid",
      })
    ).status,
    403,
  );
  assert.equal(
    (await api("/api/speech", "POST", { ...someWord, model: "paid/model" }, cookie)).status,
    400,
  );
  // The server lists its languages and this account's AI features, never keys or models.
  assert(first.languages.some((l: { name: string }) => l.name === "English"));
  assert.equal(JSON.stringify(first).includes("model"), false);
  // Text is never taken from the client (#82): the old request shape is refused.
  assert.equal(
    (await api("/api/speech", "POST", { text: "hello", language: "English" }, cookie)).status,
    400,
  );
  assert.equal(first.data.lists.length, 0);
  assert.deepEqual([first.data.baseLanguage, first.data.learningLanguage], ["Swedish", "French"]);
  const listId = randomUUID();
  const list = {
    title: "Integration",
    description: "",
    from: "Swedish",
    to: "French",
    words: [{ id: randomUUID(), front: "hej", back: "bonjour" }],
  };
  const put = (id: string, data: unknown, who = cookie, extra = {}) =>
    api(`/api/lists/${id}`, "PUT", data, who, extra);
  const saved = await put(listId, { revision: null, list });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await saved.json()).revision, 1);
  // Creating it again, or saving from a stale revision, is a conflict, never an overwrite.
  assert.equal((await put(listId, { revision: null, list })).status, 409);
  assert.equal((await put(listId, { revision: 1, list })).status, 200);
  assert.equal((await put(listId, { revision: 1, list })).status, 409);
  assert.equal(
    (await put(listId, { revision: 2, list }, cookie, { Origin: "https://attacker.invalid" }))
      .status,
    403,
  );
  assert.equal((await put(listId, { revision: 2, list: { bad: true } })).status, 400);
  assert.equal((await put("not-a-uuid", { revision: null, list })).status, 404);
  const reg2 = await api("/api/auth", "POST", {
    action: "register",
    email: `other-${randomUUID()}@example.test`,
    password,
  });
  assert.equal(reg2.status, 200);
  const cookie2 = reg2.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    (await (await api("/api/workspace", "GET", undefined, cookie2)).json()).data.lists.length,
    0,
  );
  // Another account can't overwrite the list, take over its words or review them.
  assert.equal((await put(listId, { revision: 2, list }, cookie2)).status, 404);
  assert.equal((await put(listId, { revision: null, list }, cookie2)).status, 404);
  assert.equal((await put(randomUUID(), { revision: null, list }, cookie2)).status, 409);
  const othersReview = {
    id: randomUUID(),
    wordId: list.words[0].id,
    direction: "forward",
    correct: true,
  };
  assert.equal((await api("/api/reviews", "POST", othersReview, cookie2)).status, 404);

  // The AI endpoints read words by id from the account's own lists (#82): another account's
  // word, or none, is 404 before any AI setting is even looked at, so no provider is called.
  const ownWord = list.words[0].id;
  const note = (wordId: string, answer: string, who = cookie) =>
    api(
      "/api/feedback",
      "POST",
      { wordId, direction: "forward", answer, requireAccents: true, caseSensitive: false },
      who,
    );
  assert.equal(
    (await api("/api/speech", "POST", { wordId: ownWord, part: "native" }, cookie2)).status,
    404,
  );
  assert.equal((await api("/api/speech", "POST", someWord, cookie)).status, 404);
  assert.equal((await note(ownWord, "salut", cookie2)).status, 404);
  assert.equal((await note(randomUUID(), "salut")).status, 404);
  assert.equal(
    (await api("/api/feedback", "POST", { wordId: ownWord, answer: "x", source: "hej" }, cookie))
      .status,
    400,
  );
  // The grade is worked out on the server: a correct answer needs no note.
  assert.equal((await (await note(ownWord, " BONJOUR ")).json()).status, "not-needed");
  // Only check the disabled paths when this stack has no AI configured, so a dev stack with a
  // real key never makes a paid call here.
  if (!first.ai.speech.includes("Swedish")) {
    const disabledAudio = await api(
      "/api/speech",
      "POST",
      { wordId: ownWord, part: "native" },
      cookie,
    );
    assert.equal(disabledAudio.status, 503);
    assert.equal((await disabledAudio.json()).status, "disabled");
  }
  if (!first.ai.languageNotes)
    assert.equal((await (await note(ownWord, "salut")).json()).status, "disabled");
  assert.equal((await api("/api/auth", "DELETE", {}, cookie)).status, 200);
  assert.equal((await api("/api/workspace", "GET", undefined, cookie)).status, 401);
  const bad = await api("/api/auth", "POST", {
    action: "login",
    email,
    password: "incorrect-passphrase",
  });
  assert.equal(bad.status, 401);
  const login = await api("/api/auth", "POST", { action: "login", email, password });
  assert.equal(login.status, 200);
  const cookie3 = login.headers.get("set-cookie")!.split(";")[0];
  const persisted = await (await api("/api/workspace", "GET", undefined, cookie3)).json();
  assert.equal(persisted.data.lists[0].title, "Integration");
  assert.deepEqual(persisted.listRevisions, { [listId]: 2 });
  const oversized = await put(listId, { revision: 2, list: "x".repeat(2_000_001) }, cookie3);
  assert.equal(oversized.status, 413);
  // Repeated attempts must produce a persistent, database-backed limit.
  const rateEmail = `rate-${randomUUID()}@example.test`;
  let limited = false;
  for (let i = 0; i < 17; i++) {
    const attempt = await api("/api/auth", "POST", { action: "login", email: rateEmail, password });
    if (attempt.status === 429) {
      limited = true;
      break;
    }
  }
  assert(limited);
});
test("real HTTP: a 4096-character password registers and signs in; longer gets a clear 400", async () => {
  // Non-ASCII, so the request body is well over the old 4 KB limit.
  const password = "å".repeat(4096);
  const email = `long-password-${randomUUID()}@example.test`;
  const reg = await api("/api/auth", "POST", { action: "register", email, password });
  assert.equal(reg.status, 200, await reg.clone().text());
  const login = await api("/api/auth", "POST", { action: "login", email, password });
  assert.equal(login.status, 200, await login.clone().text());
  const tooLong = await api("/api/auth", "POST", {
    action: "login",
    email,
    password: password + "å",
  });
  assert.equal(tooLong.status, 400);
  assert.equal((await tooLong.json()).error, "Use a password of at most 4096 characters.");
});
