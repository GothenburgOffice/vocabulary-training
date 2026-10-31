import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { makeWord } from "../lib/learning.ts";
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3013";
const origin = process.env.TEST_ORIGIN ?? base;
const headers = { "Content-Type": "application/json", Origin: origin };
async function api(path: string, method = "GET", data?: unknown, cookie = "", extra = {}) {
  return fetch(base + path, { method, headers: { ...headers, Cookie: cookie, ...extra }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
}

test("real HTTP and PostgreSQL: accounts, ownership, persistence, conflicts, CSRF and logout", async () => {
  const password = "integration-test-only-password";
  const email = `integration-${randomUUID()}@example.test`;
  assert.equal((await api("/api/workspace")).status, 401);
  assert.equal((await api("/api/health")).status, 200);
  assert.match((await api("/api/health")).headers.get("content-security-policy") ?? "", /media-src 'self' blob:/);
  assert.equal((await api("/api/speech", "POST", { text: "hello", language: "English" })).status, 401);
  const reg = await api("/api/auth", "POST", { action: "register", email, password });
  assert.equal(reg.status, 200, await reg.clone().text());
  const rawCookie = reg.headers.get("set-cookie")!;
  assert(rawCookie.includes("HttpOnly")); assert(rawCookie.includes("SameSite=strict"));
  const cookie = rawCookie.split(";")[0];
  const first = await (await api("/api/workspace", "GET", undefined, cookie)).json();
  assert.equal((await api("/api/speech", "POST", { text: "hello", language: "English" }, cookie, { Origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await api("/api/speech", "POST", { text: "hello", language: "English", model: "paid/model" }, cookie)).status, 400);
  const disabledAudio = await api("/api/speech", "POST", { text: "hello", language: "English" }, cookie);
  assert.equal(disabledAudio.status, 503);
  assert.equal((await disabledAudio.json()).status, "disabled");
  assert.equal(first.data.lists.length, 0);
  const list = { id: "one", title: "Integration", description: "", from: "Swedish", to: "French", words: [makeWord("hej", "bonjour", "w1")] };
  const data = { ...first.data, lists: [list] };
  const saved = await api("/api/workspace", "PUT", { revision: first.revision, data }, cookie);
  assert.equal(saved.status, 200);
  assert.equal((await api("/api/workspace", "PUT", { revision: first.revision, data }, cookie)).status, 409);
  assert.equal((await api("/api/workspace", "PUT", { revision: 1, data }, cookie, { Origin: "https://attacker.invalid" })).status, 403);
  assert.equal((await api("/api/workspace", "PUT", { revision: 1, data: { bad: true } }, cookie)).status, 400);
  const reg2 = await api("/api/auth", "POST", { action: "register", email: `other-${randomUUID()}@example.test`, password });
  assert.equal(reg2.status, 200);
  const cookie2 = reg2.headers.get("set-cookie")!.split(";")[0];
  assert.equal((await (await api("/api/workspace", "GET", undefined, cookie2)).json()).data.lists.length, 0);
  assert.equal((await api("/api/auth", "DELETE", {}, cookie)).status, 200);
  assert.equal((await api("/api/workspace", "GET", undefined, cookie)).status, 401);
  const bad = await api("/api/auth", "POST", { action: "login", email, password: "incorrect-passphrase" });
  assert.equal(bad.status, 401);
  const login = await api("/api/auth", "POST", { action: "login", email, password });
  assert.equal(login.status, 200);
  const cookie3 = login.headers.get("set-cookie")!.split(";")[0];
  const persisted = await (await api("/api/workspace", "GET", undefined, cookie3)).json();
  assert.equal(persisted.data.lists[0].title, "Integration");
  assert.equal(persisted.revision, 1);
  const oversized = await api("/api/workspace", "PUT", { revision: 1, data: "x".repeat(2_000_001) }, cookie3);
  assert.equal(oversized.status, 413);
  // Repeated attempts must produce a persistent, database-backed limit.
  const rateEmail = `rate-${randomUUID()}@example.test`;
  let limited = false;
  for (let i = 0; i < 17; i++) {
    const attempt = await api("/api/auth", "POST", { action: "login", email: rateEmail, password });
    if (attempt.status === 429) { limited = true; break; }
  }
  assert(limited);
});
