import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api } from "./helpers.mts";

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
    // The Requesty monitor key (#121). Saving a key asks Requesty for its permissions, so only
    // the paths that never reach Requesty are tested here (the check is unit-tested).
    assert.deepEqual(before.monitor, { key: { state: "unset" }, appLabel: "vocabulary-training" });
    assert.equal((await api("/api/admin/ai/usage")).status, 404);
    const usage = await api("/api/admin/ai/usage", "GET", undefined, admin);
    assert.deepEqual(await usage.json(), { configured: false });
    assert.equal(
      (
        await api("/api/admin/ai/monitor", "PUT", { appLabel: "x" }, admin, {
          Origin: "https://attacker.invalid",
        })
      ).status,
      403,
    );
    assert.equal((await api("/api/admin/ai/monitor", "PUT", { appLabel: "x" })).status, 404);
    assert.equal(
      (await api("/api/admin/ai/monitor", "PUT", { appLabel: "two words" }, admin)).status,
      400,
    );
    // Creating the key needs an admin; an incomplete request is refused before Requesty.
    const create = { adminKey: "rqsty-sk-integration-admin-dummy", name: "Monitor" };
    assert.equal((await api("/api/admin/ai/monitor/create", "POST", create)).status, 404);
    assert.equal(
      (
        await api("/api/admin/ai/monitor/create", "POST", create, admin, {
          Origin: "https://attacker.invalid",
        })
      ).status,
      403,
    );
    assert.equal(
      (await api("/api/admin/ai/monitor/create", "POST", { ...create, name: "" }, admin)).status,
      400,
    );
    const labelled = await api("/api/admin/ai/monitor", "PUT", { appLabel: "vt-test" }, admin);
    assert.equal(labelled.status, 200, await labelled.clone().text());
    assert.equal((await labelled.json()).monitor.appLabel, "vt-test");
    const unset = await api("/api/admin/ai/monitor", "PUT", { apiKey: null }, admin);
    assert.deepEqual((await unset.json()).monitor, {
      key: { state: "unset" },
      appLabel: "vt-test",
    });

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
    await api(
      "/api/admin/ai/monitor",
      "PUT",
      { apiKey: null, appLabel: "vocabulary-training" },
      admin,
    );
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
