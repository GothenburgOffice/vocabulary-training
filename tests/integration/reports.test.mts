import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api } from "./helpers.mts";

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
