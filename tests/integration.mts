import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3013";
const origin = process.env.TEST_ORIGIN ?? base;
const headers = { "Content-Type": "application/json", Origin: origin };
async function api(path: string, method = "GET", data?: unknown, cookie = "", extra = {}) {
  return fetch(base + path, {
    method,
    headers: { ...headers, Cookie: cookie, ...extra },
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
  });
}

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

test("real HTTP: the admin area answers 404 to everyone but admins", async () => {
  assert.equal((await api("/admin")).status, 404);
  assert.equal((await api("/api/admin/registration")).status, 404);
  // The privacy page is public, and this stack has a privacy contact (registration works).
  const privacyPage = await api("/privacy");
  assert.equal(privacyPage.status, 200);
  const privacyHtml = await privacyPage.text();
  assert.match(privacyHtml, /Privacy and cookies/);
  assert.match(privacyHtml, /Privacy contact/);
  const email = `not-admin-${randomUUID()}@example.test`;
  const reg = await api("/api/auth", "POST", {
    action: "register",
    email,
    password: "integration-test-only-password",
  });
  assert.equal(reg.status, 200, await reg.clone().text());
  const cookie = reg.headers.get("set-cookie")!.split(";")[0];
  assert.equal((await api("/admin", "GET", undefined, cookie)).status, 404);
  const me = await (await api("/api/workspace", "GET", undefined, cookie)).json();
  assert.equal(me.user.is_admin, false);

  // CI creates this admin through ADMIN_EMAIL/ADMIN_PASSWORD; other stacks skip this part.
  const adminEmail = process.env.TEST_ADMIN_EMAIL;
  const adminPassword = process.env.TEST_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return;
  const login = await api("/api/auth", "POST", {
    action: "login",
    email: adminEmail,
    password: adminPassword,
  });
  assert.equal(login.status, 200, await login.clone().text());
  const adminCookie = login.headers.get("set-cookie")!.split(";")[0];
  const admin = await (await api("/api/workspace", "GET", undefined, adminCookie)).json();
  assert.equal(admin.user.is_admin, true);
  const page = await api("/admin", "GET", undefined, adminCookie);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Overview/);

  assert.equal((await api("/api/admin/users", "GET", undefined, cookie)).status, 404);
  const usersResponse = await api("/api/admin/users", "GET", undefined, adminCookie);
  assert.equal(usersResponse.status, 200, await usersResponse.clone().text());
  const users = await usersResponse.json();
  const managed = users.accounts.find((account: { email: string }) => account.email === email);
  assert.ok(managed);
  assert.equal(managed.id, me.user.id);
  assert.ok(managed.created_at);
  assert.ok(managed.last_sign_in_at);
  assert.equal(managed.ai_tier, "basic");
  assert.equal(managed.is_admin, false);
  assert.equal(managed.speech_calls_day, 0);
  assert.equal(managed.note_calls_90, 0);
  assert.ok(users.limits.speech.lettersPerDay.basic > 0);
  assert.equal(typeof users.total, "number");
  assert.ok(users.total >= users.accounts.length);
  assert.ok(users.accounts.length <= users.pageSize);

  // Search and scope run on the server: a unique address finds exactly the managed account.
  const searched = await (
    await api(`/api/admin/users?q=${encodeURIComponent(email)}`, "GET", undefined, adminCookie)
  ).json();
  assert.deepEqual(
    searched.accounts.map((account: { id: string }) => account.id),
    [me.user.id],
  );
  assert.equal(searched.total, 1);
  // LIKE wildcards in the search are literal, so a bare "%" matches no address.
  const wildcard = await (
    await api("/api/admin/users?q=%25", "GET", undefined, adminCookie)
  ).json();
  assert.equal(wildcard.total, 0);
  // E2E accounts are the only ones in the test scope; the managed account is not one of them.
  const testScope = await (
    await api("/api/admin/users?scope=test&offset=0", "GET", undefined, adminCookie)
  ).json();
  assert.ok(
    testScope.accounts.every((account: { email: string }) =>
      /^e2e-.+@example\.test$/i.test(account.email),
    ),
  );
  assert.equal(
    (await api("/api/admin/users?offset=-1", "GET", undefined, adminCookie)).status,
    400,
  );
  // Sorted on the server, usage included (it's summed before the page is cut); only known
  // columns and directions are accepted.
  const bySpeech = (
    await (await api("/api/admin/users?sort=speech&dir=desc", "GET", undefined, adminCookie)).json()
  ).accounts.map((account: { speech_letters_90: string }) => Number(account.speech_letters_90));
  assert.deepEqual(
    bySpeech,
    [...bySpeech].sort((a, b) => b - a),
  );
  for (const query of ["sort=password_hash", "sort=email%3B%20DROP%20TABLE%20users", "dir=up"])
    assert.equal(
      (await api(`/api/admin/users?${query}`, "GET", undefined, adminCookie)).status,
      400,
      query,
    );
  assert.equal(
    (await api("/api/admin/users", "PATCH", { userId: me.user.id, tier: "plus" }, cookie)).status,
    404,
  );
  assert.equal(
    (await api("/api/admin/users", "PATCH", { userId: me.user.id, locked: true }, cookie)).status,
    404,
  );

  assert.equal(
    (
      await api("/api/admin/users", "PATCH", { userId: me.user.id, tier: "plus" }, adminCookie, {
        Origin: "https://attacker.invalid",
      })
    ).status,
    403,
  );
  assert.equal(
    (await api("/api/admin/users", "PATCH", { userId: me.user.id, tier: "invalid" }, adminCookie))
      .status,
    400,
  );
  assert.equal(
    (await api("/api/admin/users", "PATCH", { userId: me.user.id, tier: "plus" }, adminCookie))
      .status,
    200,
  );
  const change = (data: object) => api("/api/admin/users", "PATCH", data, adminCookie);
  const signIn = (password = "integration-test-only-password") =>
    api("/api/auth", "POST", { action: "login", email, password });

  // An admin can't lock or trash their own account, and a single account is never deleted at
  // once: only the E2E test-account cleanup deletes immediately.
  assert.equal((await change({ userId: admin.user.id, locked: true })).status, 400);
  assert.equal((await change({ userId: admin.user.id, trashed: true })).status, 400);
  assert.equal(
    (await api("/api/admin/users", "DELETE", { userId: me.user.id }, adminCookie)).status,
    400,
  );

  // Lock: the session ends at once and sign-in is refused, but only after the password checks
  // out, so a wrong password still just says it is wrong.
  const locked = await change({ userId: me.user.id, locked: true });
  assert.equal(locked.status, 200, await locked.clone().text());
  assert.ok((await locked.json()).account.locked_at);
  assert.equal((await api("/api/workspace", "GET", undefined, cookie)).status, 401);
  assert.equal((await signIn()).status, 403);
  assert.equal((await signIn("wrong-password-for-this-test")).status, 401);
  assert.equal((await change({ userId: me.user.id, locked: false })).status, 200);
  assert.equal((await signIn()).status, 200);

  // Trash: locked at once, listed in the trash, and restorable until it is purged.
  const trashed = await change({ userId: me.user.id, trashed: true });
  assert.equal(trashed.status, 200, await trashed.clone().text());
  assert.ok((await trashed.json()).account.deleted_at);
  assert.equal((await signIn()).status, 403);
  const trash = await (
    await api(
      `/api/admin/users?scope=trash&q=${encodeURIComponent(email)}`,
      "GET",
      undefined,
      adminCookie,
    )
  ).json();
  assert.equal(trash.total, 1);
  assert.equal(trash.trashDays, 30);
  assert.equal((await change({ userId: me.user.id, trashed: false })).status, 200);
  assert.equal((await signIn()).status, 200);
  // Left in the trash; the purge 30 days on is checked against the database, not here.
  assert.equal((await change({ userId: me.user.id, trashed: true })).status, 200);
});

test("real HTTP: admin AI settings and languages, with dummy keys and no provider calls", async () => {
  const adminEmail = process.env.TEST_ADMIN_EMAIL;
  const adminPassword = process.env.TEST_ADMIN_PASSWORD;
  // This writes site settings, so it needs its own opt-in (CI sets it) on a stack whose AI
  // settings are empty, never only the admin login that the admin-access test uses.
  if (!adminEmail || !adminPassword || process.env.TEST_WRITE_SITE_SETTINGS !== "1") return;
  const login = await api("/api/auth", "POST", {
    action: "login",
    email: adminEmail,
    password: adminPassword,
  });
  assert.equal(login.status, 200, await login.clone().text());
  const admin = login.headers.get("set-cookie")!.split(";")[0];
  const dummyKey = "rqsty-sk-integration-test-dummy-key";
  type AdminLanguage = { name: string; revision: string; speech: { model: string } };
  const readLanguages = async (): Promise<AdminLanguage[]> =>
    (await (await api("/api/admin/languages", "GET", undefined, admin)).json()).languages;

  const before = await (await api("/api/admin/ai", "GET", undefined, admin)).json();
  const languages = await readLanguages();
  assert.deepEqual(
    [before.tiers.basic, before.tiers.plus, languages.filter((l) => l.speech.model).length],
    [{ model: "", key: { state: "unset" } }, { model: "", key: { state: "unset" } }, 0],
    "TEST_WRITE_SITE_SETTINGS needs a stack without AI settings: this test clears them.",
  );
  const english = languages.find((l) => l.name === "English")!;
  const registration = await (await api("/api/admin/registration", "GET", undefined, admin)).json();
  assert.equal(registration.open, true);
  try {
    assert.equal((await api("/api/admin/ai")).status, 404);
    assert.equal(
      (
        await api("/api/admin/ai", "PUT", { tier: "basic", model: "x" }, admin, {
          Origin: "https://attacker.invalid",
        })
      ).status,
      403,
    );
    const saved = await api(
      "/api/admin/ai",
      "PUT",
      { tier: "basic", apiKey: dummyKey, model: "synthetic/chat" },
      admin,
    );
    assert.equal(saved.status, 200, await saved.clone().text());
    const view = await saved.text();
    assert.equal(view.includes(dummyKey), false);
    assert.equal(JSON.parse(view).tiers.basic.key.hint, dummyKey.slice(-4));

    const speech = (model: string) => ({
      ...english,
      speech: { model, voice: "", instructions: "" },
    });
    assert.equal((await api("/api/admin/languages", "PUT", speech("policy/x"), admin)).status, 400);
    assert.equal(
      (await api("/api/admin/languages", "PUT", speech("synthetic/tts"), admin)).status,
      200,
    );
    // Saved from the revision loaded before that change: refused, not overwritten.
    const stale = await api("/api/admin/languages", "PUT", { ...english, hidden: true }, admin);
    assert.equal(stale.status, 409);
    const name = `Integration ${randomUUID().slice(0, 8)}`;
    const added = await api("/api/admin/languages", "POST", { name, code: "" }, admin);
    assert.equal(added.status, 200, await added.clone().text());
    const integration = (await added.json()).languages.find((l: AdminLanguage) => l.name === name);
    assert.equal(
      (await api("/api/admin/languages", "PUT", { ...integration, hidden: true }, admin)).status,
      200,
    );

    const me = await (await api("/api/workspace", "GET", undefined, admin)).json();
    assert.deepEqual(me.ai, { languageNotes: true, speech: ["English"] });
    assert(
      me.languages.some((l: { name: string; hidden: boolean }) => l.name === name && l.hidden),
    );
    assert.equal(JSON.stringify(me).includes(dummyKey), false);

    // With AI on, a note or a clip reaches the letter charge (#82). A daily budget of 1 letter
    // makes the charge refuse it as "limited", so the charge's SQL runs and no provider is
    // called. (0 would mean no limit.)
    const limitsNow = (await (await api("/api/admin/limits", "GET", undefined, admin)).json())
      .limits;
    const noBudget = (k: typeof limitsNow.speech) => ({
      ...k,
      lettersPerDay: { basic: 1, plus: 1 },
    });
    const wordId = randomUUID();
    const aiList = randomUUID();
    try {
      const zero = {
        ...limitsNow,
        speech: noBudget(limitsNow.speech),
        note: noBudget(limitsNow.note),
      };
      assert.equal((await api("/api/admin/limits", "PUT", zero, admin)).status, 200);
      const created = await api(
        `/api/lists/${aiList}`,
        "PUT",
        {
          revision: null,
          list: {
            title: "AI limits",
            description: "",
            from: "Swedish",
            to: "English",
            words: [{ id: wordId, front: "hej", back: "hello" }],
          },
        },
        admin,
      );
      assert.equal(created.status, 200, await created.clone().text());
      const ask = (answer: string) =>
        api(
          "/api/feedback",
          "POST",
          { wordId, direction: "forward", answer, requireAccents: true, caseSensitive: false },
          admin,
        );
      assert.equal((await (await ask("hello")).json()).status, "not-needed");
      const limitedNote = await ask("goodbye");
      assert.equal(limitedNote.status, 200);
      assert.equal((await limitedNote.json()).status, "limited");
      const limitedClip = await api("/api/speech", "POST", { wordId, part: "learning" }, admin);
      assert.equal(limitedClip.status, 429);
      assert.equal((await limitedClip.json()).status, "limited");

      // With the account's AI switch off (#113), neither call gets as far as the letter
      // charge: "disabled", not "limited". The workspace still says what the site offers.
      assert.equal((await api("/api/profile", "PATCH", { aiEnabled: false }, admin)).status, 200);
      const offNote = await (await ask("goodbye")).json();
      assert.equal(offNote.status, "disabled");
      assert.match(offNote.message, /turned off in your profile/);
      const offClip = await api("/api/speech", "POST", { wordId, part: "learning" }, admin);
      assert.equal(offClip.status, 503);
      assert.equal((await offClip.json()).status, "disabled");
      const offWorkspace = await (await api("/api/workspace", "GET", undefined, admin)).json();
      assert.equal(offWorkspace.data.aiEnabled, false);
      assert.deepEqual(offWorkspace.ai, { languageNotes: true, speech: ["English"] });
      assert.equal((await api("/api/profile", "PATCH", { aiEnabled: true }, admin)).status, 200);
      assert.equal((await (await ask("goodbye")).json()).status, "limited");
    } finally {
      await api("/api/profile", "PATCH", { aiEnabled: true }, admin);
      await api("/api/admin/limits", "PUT", limitsNow, admin);
      await api(`/api/lists/${aiList}`, "DELETE", { revision: 1 }, admin);
    }

    // Registration: closed when switched off, and it can't be switched on without its
    // checklist (here: the privacy contact).
    const { controllerName, contactEmail } = registration;
    const saveRegistration = (update: object) =>
      api(
        "/api/admin/registration",
        "PUT",
        { open: true, controllerName, contactEmail, ...update },
        admin,
      );
    assert.equal((await saveRegistration({ contactEmail: "not-an-email" })).status, 400);
    assert.equal((await saveRegistration({ open: false })).status, 200);
    const off = await api("/api/auth", "POST", {
      action: "register",
      email: `closed-${randomUUID()}@example.test`,
      password: "integration-test-only-password",
    });
    assert.equal(off.status, 403);
    assert.match((await off.json()).error, /closed/);
    const blocked = await saveRegistration({ controllerName: "", contactEmail: "" });
    assert.equal(blocked.status, 400);
    assert.match((await blocked.json()).error, /privacy contact/);
    const cleared = await saveRegistration({ open: false, controllerName: "", contactEmail: "" });
    assert.equal(cleared.status, 200);
    assert.equal((await cleared.json()).blockers.length, 2);
  } finally {
    // Back to no key, no models, and English and registration as they were, even after a
    // failed assertion.
    await api("/api/admin/ai", "PUT", { tier: "basic", apiKey: null, model: "" }, admin);
    const { open, controllerName, contactEmail } = registration;
    await api("/api/admin/registration", "PUT", { open, controllerName, contactEmail }, admin);
    const current = (await readLanguages()).find((l) => l.name === "English")!;
    await api("/api/admin/languages", "PUT", { ...english, revision: current.revision }, admin);
  }
  const after = await (await api("/api/workspace", "GET", undefined, admin)).json();
  assert.deepEqual(after.ai, { languageNotes: false, speech: [] });

  // The AI limits (#82): saved and read back, invalid ones refused, then restored.
  const limitsBefore = (await (await api("/api/admin/limits", "GET", undefined, admin)).json())
    .limits;
  const changed = {
    ...limitsBefore,
    speech: { ...limitsBefore.speech, lettersPerMinute: 123 },
    speechBlockMs: 7000,
  };
  try {
    const saved = await api("/api/admin/limits", "PUT", changed, admin);
    assert.equal(saved.status, 200, await saved.clone().text());
    const reread = (await (await api("/api/admin/limits", "GET", undefined, admin)).json()).limits;
    assert.deepEqual(reread, changed);
    assert.equal(
      (await api("/api/admin/limits", "PUT", { ...changed, speechBlockMs: 1500 }, admin)).status,
      400,
    );
    // Admin only, like every admin API.
    const someone = await api("/api/auth", "POST", {
      action: "register",
      email: `limits-${randomUUID()}@example.test`,
      password: "integration-test-only-password",
    });
    const someoneCookie = someone.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await api("/api/admin/limits", "PUT", changed, someoneCookie)).status, 404);
  } finally {
    await api("/api/admin/limits", "PUT", limitsBefore, admin);
  }
  const reopened = await api("/api/auth", "POST", {
    action: "register",
    email: `reopened-${randomUUID()}@example.test`,
    password: "integration-test-only-password",
  });
  assert.equal(reopened.status, 200, await reopened.clone().text());
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

test("real HTTP: AI result reports are saved once per result, anonymously, and checked", async () => {
  const report = {
    activityId: `int-${randomUUID().slice(0, 8)}`,
    kind: "note",
    reason: "incorrect-note",
    word: "vi ses snart",
    language: "Swedish",
    model: "dummy/note-model",
    prompt: { model: "dummy/note-model", messages: [{ role: "user", content: "test" }] },
    at: new Date().toISOString(),
  };
  assert.equal((await api("/api/reports", "POST", report)).status, 401);

  const register = async () => {
    const email = `integration-${randomUUID()}@example.test`;
    const reg = await api("/api/auth", "POST", {
      action: "register",
      email,
      password: "integration-test-only-password",
    });
    assert.equal(reg.status, 200, await reg.clone().text());
    return reg.headers.get("set-cookie")!.split(";")[0];
  };
  const cookie = await register();

  const first = await api("/api/reports", "POST", report, cookie);
  assert.equal(first.status, 200, await first.clone().text());
  assert.deepEqual(await first.json(), { status: "saved" });
  // The same result reported twice is kept once.
  assert.deepEqual(await (await api("/api/reports", "POST", report, cookie)).json(), {
    status: "duplicate",
  });
  // Reports carry no account, so the result's random id alone makes it the same report.
  const other = await register();
  assert.deepEqual(await (await api("/api/reports", "POST", report, other)).json(), {
    status: "duplicate",
  });

  // A reason for audio does not apply to a note, and unknown fields are refused.
  const garbled = { ...report, activityId: "int-other", reason: "garbled-audio" };
  assert.equal((await api("/api/reports", "POST", garbled, cookie)).status, 400);
  const extra = { ...report, activityId: "int-extra", userId: randomUUID() };
  assert.equal((await api("/api/reports", "POST", extra, cookie)).status, 400);
  // Cross-site requests are refused before anything is read.
  assert.equal(
    (await api("/api/reports", "POST", report, cookie, { Origin: "https://evil.example" })).status,
    403,
  );
  // An oversized request is refused by size, not stored truncated.
  const huge = { ...report, activityId: "int-huge", prompt: { text: "x".repeat(30_000) } };
  assert.equal((await api("/api/reports", "POST", huge, cookie)).status, 413);

  // Each account may send 20 reports an hour (the first two above count, the refused ones
  // don't); the account is counted in memory, never stored.
  for (let i = 0; i < 18; i++) {
    const next = { ...report, activityId: `int-limit-${randomUUID().slice(0, 8)}` };
    assert.equal((await api("/api/reports", "POST", next, cookie)).status, 200, `report ${i}`);
  }
  const over = { ...report, activityId: `int-limit-${randomUUID().slice(0, 8)}` };
  assert.equal((await api("/api/reports", "POST", over, cookie)).status, 429);
});

test("real HTTP: admins list and prune reports without seeing accounts; learners cannot", async () => {
  const reg = await api("/api/auth", "POST", {
    action: "register",
    email: `integration-${randomUUID()}@example.test`,
    password: "integration-test-only-password",
  });
  assert.equal(reg.status, 200, await reg.clone().text());
  const cookie = reg.headers.get("set-cookie")!.split(";")[0];
  const word = `integration-${randomUUID().slice(0, 8)}`;
  const report = {
    activityId: `int-${randomUUID().slice(0, 8)}`,
    kind: "speech",
    reason: "pronunciation",
    word,
    language: "French",
    model: "dummy/tts-model",
    voice: "Mia",
    prompt: { part: "learning" },
    at: new Date().toISOString(),
  };
  assert.equal((await api("/api/reports", "POST", report, cookie)).status, 200);
  // The admin endpoints answer 404 to a learner, as the rest of the admin area does.
  assert.equal((await api("/api/admin/reports", "GET", undefined, cookie)).status, 404);
  assert.equal(
    (await api("/api/admin/reports", "DELETE", { olderThanDays: 15 }, cookie)).status,
    404,
  );

  const adminEmail = process.env.TEST_ADMIN_EMAIL;
  const adminPassword = process.env.TEST_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return;
  const login = await api("/api/auth", "POST", {
    action: "login",
    email: adminEmail,
    password: adminPassword,
  });
  assert.equal(login.status, 200, await login.clone().text());
  const adminCookie = login.headers.get("set-cookie")!.split(";")[0];

  const get = async (query: string) => {
    const response = await api(`/api/admin/reports?${query}`, "GET", undefined, adminCookie);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  let view = await get("");
  assert.equal("summary" in view, false);
  assert.equal(view.retentionDays, 15);
  // Newest first, page after page: each page starts after the last report shown, so none
  // repeats. The new report is today's, among others from today on a busy test database.
  type Row = { id: string; word: string; reported_on: string; activity_on: string };
  const findReport = async () => {
    const seen = new Set<string>();
    let page: { reports: Row[] } = view;
    for (let pages = 0; pages < 40 && page.reports.length; pages++) {
      for (const row of page.reports) {
        assert.equal(seen.has(row.id), false, "a report repeats across pages");
        seen.add(row.id);
      }
      const match = page.reports.find((row) => row.word === word);
      if (match) return match as Row & Record<string, unknown>;
      page = await get(`after=${page.reports.at(-1)!.id}`);
    }
  };
  const found = await findReport();
  assert.ok(found, "the new report is listed");
  assert.deepEqual(found.prompt, { part: "learning" });
  assert.equal(found.tier, "basic");
  // No account in the admin view.
  for (const key of ["user_id", "userId", "email"]) assert.equal(key in found, false, key);
  // Dates only, no times; and no clustering.
  assert.match(found.reported_on, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(found.activity_on, /^\d{4}-\d{2}-\d{2}$/);
  // Sorted by a column on the server, which accepts only known columns and directions.
  const byModel = (await get("sort=model&dir=asc")).reports.map((row: { model: string }) =>
    row.model.toLowerCase(),
  );
  assert.deepEqual(byModel, [...byModel].sort());
  // Type sorts by the label shown (Audio before Language note), not the stored code.
  const byType = (await get("sort=kind&dir=asc")).reports.map((row: { kind: string }) => row.kind);
  assert.equal(
    byType.indexOf("note") === -1 || byType.lastIndexOf("speech") < byType.indexOf("note"),
    true,
  );
  for (const query of [
    "sort=prompt",
    "sort=model%3B%20DROP%20TABLE%20issue_reports",
    "dir=up",
    "after=50",
  ])
    assert.equal(
      (await api(`/api/admin/reports?${query}`, "GET", undefined, adminCookie)).status,
      400,
      query,
    );

  // Only the retention period is accepted, and a prune never removes a fresh report.
  assert.equal(
    (await api("/api/admin/reports", "DELETE", { olderThanDays: 1 }, adminCookie)).status,
    400,
  );
  assert.equal(
    (
      await api("/api/admin/reports", "DELETE", { olderThanDays: 15 }, adminCookie, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  const pruned = await api("/api/admin/reports", "DELETE", { olderThanDays: 15 }, adminCookie);
  assert.equal(pruned.status, 200, await pruned.clone().text());
  assert.equal(typeof (await pruned.json()).deleted, "number");
  // A fresh report survives the prune.
  view = await get("");
  assert.ok(await findReport());
});

test("real HTTP: the Appearance setting is saved on the account and set on every page", async () => {
  const signedOut = await (await api("/")).text();
  assert.match(signedOut, /<html[^>]* data-theme="system"/);
  const reg = await api("/api/auth", "POST", {
    action: "register",
    email: `theme-${randomUUID()}@example.test`,
    password: "integration-test-only-password",
  });
  assert.equal(reg.status, 200, await reg.clone().text());
  const cookie = reg.headers.get("set-cookie")!.split(";")[0];
  const workspace = async () =>
    (await (await api("/api/workspace", "GET", undefined, cookie)).json()).data;
  assert.equal((await workspace()).theme, "system");

  const save = (data: unknown) => api("/api/profile", "PATCH", data, cookie);
  assert.equal((await save({ theme: "sepia" })).status, 400);
  assert.equal((await save({ theme: "dark", baseLanguage: "Swedish" })).status, 400);
  assert.equal((await api("/api/profile", "PATCH", { theme: "dark" })).status, 401);
  const saved = await save({ theme: "dark" });
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await workspace()).theme, "dark");
  // The page is rendered in the account's scheme, before any script runs.
  for (const path of ["/", "/privacy"]) {
    const html = await (await api(path, "GET", undefined, cookie)).text();
    assert.match(html, /<html[^>]* data-theme="dark"/, path);
  }
  // Saving the languages leaves the theme alone.
  assert.equal((await save({ baseLanguage: "Swedish", learningLanguage: "German" })).status, 200);
  assert.equal((await workspace()).theme, "dark");
});

test("real HTTP: the AI features switch is saved on the account, on its own", async () => {
  const register = async () => {
    const reg = await api("/api/auth", "POST", {
      action: "register",
      email: `ai-switch-${randomUUID()}@example.test`,
      password: "integration-test-only-password",
    });
    assert.equal(reg.status, 200, await reg.clone().text());
    return reg.headers.get("set-cookie")!.split(";")[0];
  };
  const cookie = await register();
  const other = await register();
  const workspace = async (who = cookie) =>
    (await (await api("/api/workspace", "GET", undefined, who)).json()).data;
  assert.equal((await workspace()).aiEnabled, true);

  const save = (data: unknown) => api("/api/profile", "PATCH", data, cookie);
  assert.equal((await save({ aiEnabled: "false" })).status, 400);
  assert.equal((await save({ aiEnabled: false, theme: "dark" })).status, 400);
  assert.equal((await api("/api/profile", "PATCH", { aiEnabled: false })).status, 401);
  const crossOrigin = await api("/api/profile", "PATCH", { aiEnabled: false }, cookie, {
    Origin: "https://attacker.invalid",
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await workspace()).aiEnabled, true);

  assert.equal((await save({ aiEnabled: false })).status, 200);
  assert.equal((await workspace()).aiEnabled, false);
  // Only this account's switch.
  assert.equal((await workspace(other)).aiEnabled, true);
  // Off, a language note is refused before any AI setting is read, whatever the stack has.
  // (A note needs a word: the account's own.)
  const listId = randomUUID();
  const wordId = randomUUID();
  const created = await api(
    `/api/lists/${listId}`,
    "PUT",
    {
      revision: null,
      list: {
        title: "AI off",
        description: "",
        from: "Swedish",
        to: "French",
        words: [{ id: wordId, front: "hej", back: "bonjour" }],
      },
    },
    cookie,
  );
  assert.equal(created.status, 200, await created.clone().text());
  const note = await api(
    "/api/feedback",
    "POST",
    { wordId, direction: "forward", answer: "salut", requireAccents: true, caseSensitive: false },
    cookie,
  );
  const noteResult = await note.json();
  assert.equal(noteResult.status, "disabled");
  assert.match(noteResult.message, /turned off in your profile/);
  const clip = await api("/api/speech", "POST", { wordId, part: "native" }, cookie);
  assert.equal(clip.status, 503);
  // Other profile saves leave the switch alone, and the export includes it.
  assert.equal((await save({ theme: "dark" })).status, 200);
  assert.equal((await save({ baseLanguage: "Swedish", learningLanguage: "German" })).status, 200);
  assert.equal((await workspace()).aiEnabled, false);
  const exported = await (await api("/api/export", "GET", undefined, cookie)).json();
  assert.equal(exported.profile.aiEnabled, false);

  assert.equal((await save({ aiEnabled: true })).status, 200);
  assert.equal((await workspace()).aiEnabled, true);
});

test("real HTTP: the write limit refuses an account saving faster than a person can", async () => {
  const email = `writes-${randomUUID()}@example.test`;
  const reg = await api("/api/auth", "POST", {
    action: "register",
    email,
    password: "integration-test-only-password",
  });
  assert.equal(reg.status, 200, await reg.clone().text());
  const cookie = reg.headers.get("set-cookie")!.split(";")[0];
  assert.equal((await api("/api/admin/limits/writes", "GET", undefined, cookie)).status, 404);
  assert.equal(
    (await api("/api/admin/limits/writes", "PUT", { perHour: 1, perDay: 1 }, cookie)).status,
    404,
  );
  const adminEmail = process.env.TEST_ADMIN_EMAIL;
  const adminPassword = process.env.TEST_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) return;
  const login = await api("/api/auth", "POST", {
    action: "login",
    email: adminEmail,
    password: adminPassword,
  });
  const admin = login.headers.get("set-cookie")!.split(";")[0];
  const before = (await (await api("/api/admin/limits/writes", "GET", undefined, admin)).json())
    .limits;
  const put = (limits: unknown) => api("/api/admin/limits/writes", "PUT", limits, admin);
  try {
    assert.equal((await put({ perHour: -1, perDay: 10 })).status, 400);
    assert.equal(
      (
        await api("/api/admin/limits/writes", "PUT", { perHour: 3, perDay: 10 }, admin, {
          Origin: "https://attacker.invalid",
        })
      ).status,
      403,
    );
    const saved = await put({ perHour: 3, perDay: 10 });
    assert.equal(saved.status, 200, await saved.clone().text());
    assert.deepEqual((await saved.json()).limits, { perHour: 3, perDay: 10 });
    // Three saves of any kind, then the fourth is refused; nothing of it is written.
    const listId = randomUUID();
    const wordId = randomUUID();
    const list = {
      title: "Writes",
      description: "",
      from: "Swedish",
      to: "French",
      words: [{ id: wordId, front: "hej", back: "bonjour" }],
    };
    assert.equal(
      (await api(`/api/lists/${listId}`, "PUT", { revision: null, list }, cookie)).status,
      200,
    );
    assert.equal((await api("/api/profile", "PATCH", { theme: "dark" }, cookie)).status, 200);
    const review = () =>
      api(
        "/api/reviews",
        "POST",
        { id: randomUUID(), wordId, direction: "forward", correct: true },
        cookie,
      );
    assert.equal((await review()).status, 200);
    const refused = await review();
    assert.equal(refused.status, 429);
    assert.match((await refused.json()).error, /faster than a person/);
    const data = (await (await api("/api/workspace", "GET", undefined, cookie)).json()).data;
    assert.equal(data.lists[0].words[0].forward.correct, 1);
    // Admin sees when it happened, on the account.
    const users = await (
      await api(`/api/admin/users?q=${encodeURIComponent(email)}`, "GET", undefined, admin)
    ).json();
    assert.ok(users.accounts[0].write_limited_at);
    // Raised again, the account can save.
    assert.equal((await put({ perHour: 0, perDay: 0 })).status, 200);
    assert.equal((await review()).status, 200);
  } finally {
    await put(before);
  }
});

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
  assert.equal(doc.version, 3);
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

test("real HTTP: share previews, manifest, robots and sitemap use the server's origin", async () => {
  const page = await (await api("/")).text();
  const image = page.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  assert.ok(image, "the front page has an og:image");
  assert.equal(new URL(image).origin, new URL(origin).origin);
  assert.match(page, /<meta name="twitter:card" content="summary_large_image"/);
  // Each page names its own URL.
  // (Next writes the front page's URL as the bare origin.)
  const home = page.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  assert.equal(home && new URL(home).href, new URL("/", origin).href);
  const privacy = await (await api("/privacy")).text();
  assert.ok(
    privacy.includes(`<meta property="og:url" content="${new URL("/privacy", origin).href}"/>`),
  );
  // …and keeps the share image, which a page's own openGraph would otherwise drop.
  for (const html of [page, privacy]) {
    assert.match(html, /<meta property="og:image" content="[^"]*\/opengraph-image\.png/);
    assert.match(html, /<meta name="twitter:image" content="[^"]*\/opengraph-image\.png/);
    assert.equal(html.match(/<meta property="og:image" /g)?.length, 1, "one og:image");
  }
  assert.match(page, /<link rel="manifest" href="\/manifest.webmanifest"/);

  const preview = await api(new URL(image).pathname + new URL(image).search);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-type"), "image/png");

  const manifest = await (await api("/manifest.webmanifest")).json();
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons as { src: string }[]) {
    const res = await api(icon.src);
    assert.equal(res.status, 200, icon.src);
    assert.equal(res.headers.get("content-type"), "image/png");
  }

  const robots = await (await api("/robots.txt")).text();
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/api\//);
  assert.ok(robots.includes(`Sitemap: ${new URL("/sitemap.xml", origin).href}`));
  const sitemap = await (await api("/sitemap.xml")).text();
  assert.ok(sitemap.includes(`<loc>${new URL("/privacy", origin).href}</loc>`));
  assert.ok(!sitemap.includes("/admin"));
});
