import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { makeWord } from "../lib/learning.ts";
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
  assert.equal(
    (await api("/api/speech", "POST", { text: "hello", language: "English" })).status,
    401,
  );
  const reg = await api("/api/auth", "POST", { action: "register", email, password });
  assert.equal(reg.status, 200, await reg.clone().text());
  const rawCookie = reg.headers.get("set-cookie")!;
  assert(rawCookie.includes("HttpOnly"));
  assert(rawCookie.includes("SameSite=strict"));
  const cookie = rawCookie.split(";")[0];
  const first = await (await api("/api/workspace", "GET", undefined, cookie)).json();
  assert.equal(
    (
      await api("/api/speech", "POST", { text: "hello", language: "English" }, cookie, {
        Origin: "https://attacker.invalid",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api(
        "/api/speech",
        "POST",
        { text: "hello", language: "English", model: "paid/model" },
        cookie,
      )
    ).status,
    400,
  );
  // The server lists its languages and this account's AI features, never keys or models.
  assert(first.languages.some((l: { name: string }) => l.name === "English"));
  assert.equal(JSON.stringify(first).includes("model"), false);
  // Only check the disabled path when English has no speech, so a dev stack with a real key
  // never makes a paid call here.
  if (!first.ai.speech.includes("English")) {
    const disabledAudio = await api(
      "/api/speech",
      "POST",
      { text: "hello", language: "English" },
      cookie,
    );
    assert.equal(disabledAudio.status, 503);
    assert.equal((await disabledAudio.json()).status, "disabled");
  }
  assert.equal(first.data.lists.length, 0);
  const list = {
    id: "one",
    title: "Integration",
    description: "",
    from: "Swedish",
    to: "French",
    words: [makeWord("hej", "bonjour", "w1")],
  };
  const data = { ...first.data, lists: [list] };
  const saved = await api("/api/workspace", "PUT", { revision: first.revision, data }, cookie);
  assert.equal(saved.status, 200);
  assert.equal(
    (await api("/api/workspace", "PUT", { revision: first.revision, data }, cookie)).status,
    409,
  );
  assert.equal(
    (
      await api("/api/workspace", "PUT", { revision: 1, data }, cookie, {
        Origin: "https://attacker.invalid",
      })
    ).status,
    403,
  );
  assert.equal(
    (await api("/api/workspace", "PUT", { revision: 1, data: { bad: true } }, cookie)).status,
    400,
  );
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
  assert.equal(persisted.revision, 1);
  const oversized = await api(
    "/api/workspace",
    "PUT",
    { revision: 1, data: "x".repeat(2_000_001) },
    cookie3,
  );
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

test("real HTTP: the admin area answers 404 to everyone but admins", async () => {
  assert.equal((await api("/admin")).status, 404);
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
  // CI only: this writes site settings, so it must never run against a stack with real ones.
  if (!adminEmail || !adminPassword) return;
  const login = await api("/api/auth", "POST", {
    action: "login",
    email: adminEmail,
    password: adminPassword,
  });
  assert.equal(login.status, 200, await login.clone().text());
  const admin = login.headers.get("set-cookie")!.split(";")[0];
  const dummyKey = "rqsty-sk-integration-test-dummy-key";

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

  const languages = await (await api("/api/admin/languages", "GET", undefined, admin)).json();
  const english = languages.languages.find((l: { name: string }) => l.name === "English");
  const update = { ...english, speech: { model: "synthetic/tts", voice: "", instructions: "" } };
  assert.equal((await api("/api/admin/languages", "PUT", update, admin)).status, 200);
  const name = `Integration ${randomUUID().slice(0, 8)}`;
  const added = await api("/api/admin/languages", "POST", { name, code: "" }, admin);
  assert.equal(added.status, 200, await added.clone().text());
  const integration = (await added.json()).languages.find((l: { name: string }) => l.name === name);
  assert.equal(
    (await api("/api/admin/languages", "PUT", { ...integration, hidden: true }, admin)).status,
    200,
  );

  const me = await (await api("/api/workspace", "GET", undefined, admin)).json();
  assert.deepEqual(me.ai, { languageNotes: true, speech: ["English"] });
  assert(me.languages.some((l: { name: string; hidden: boolean }) => l.name === name && l.hidden));
  assert.equal(JSON.stringify(me).includes(dummyKey), false);

  // Restore: no key or models, so later runs and the restart test see AI off again.
  assert.equal(
    (await api("/api/admin/ai", "PUT", { tier: "basic", apiKey: null, model: "" }, admin)).status,
    200,
  );
  assert.equal((await api("/api/admin/languages", "PUT", english, admin)).status, 200);
  const after = await (await api("/api/workspace", "GET", undefined, admin)).json();
  assert.deepEqual(after.ai, { languageNotes: false, speech: [] });
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
