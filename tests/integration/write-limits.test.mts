import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api } from "./helpers.mts";

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
