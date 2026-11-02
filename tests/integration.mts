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
  assert.deepEqual(dump.lists[0].words[0].reverse, { correct: 0, wrong: 0, streak: 0, due: 0 });
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
    } finally {
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

test("real HTTP: AI result reports are saved once per result and account, and checked", async () => {
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
  // Another account's result with the same browser id is its own report.
  const other = await register();
  assert.deepEqual(await (await api("/api/reports", "POST", report, other)).json(), {
    status: "saved",
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
});
