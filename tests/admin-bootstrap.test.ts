import test from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_WORKSPACE,
  bootstrapAdmin,
  hashPassword,
  validAdminEmail,
} from "../scripts/admin-bootstrap.mjs";
import { verifyPassword } from "../lib/server/password.ts";
import { credentialsSchema } from "../lib/validation.ts";
import { emptyWorkspace } from "../lib/workspace.ts";

// Answers the bootstrap's queries from a list of users and records the writes.
function fakeClient(users: { email: string; is_admin: boolean }[]) {
  const writes: { sql: string; params: unknown[] }[] = [];
  return {
    writes,
    async query(sql: string, params: unknown[] = []) {
      if (sql.startsWith("SELECT 1 FROM users WHERE is_admin"))
        return { rowCount: users.filter((u) => u.is_admin).length };
      if (sql.startsWith("UPDATE users SET is_admin=true")) {
        const user = users.find((u) => u.email === params[0]);
        if (user) user.is_admin = true;
        return { rowCount: user ? 1 : 0 };
      }
      writes.push({ sql, params });
      return { rowCount: 1 };
    },
  };
}
const env = { ADMIN_EMAIL: " Admin@Example.test ", ADMIN_PASSWORD: "admin-test-only-password" };

test("bootstrap hashes passwords the way the app verifies them", async () => {
  const hash = await hashPassword("admin-test-only-password");
  assert(await verifyPassword("admin-test-only-password", hash));
  assert.equal(await verifyPassword("another-password", hash), false);
});

test("bootstrap creates the same empty workspace as registration", () => {
  assert.deepEqual(EMPTY_WORKSPACE, emptyWorkspace());
});

test("bootstrap creates the admin only while no admin exists", async () => {
  assert.equal(await bootstrapAdmin(fakeClient([]), {}), "skipped");
  const existing = fakeClient([{ email: "other@example.test", is_admin: true }]);
  assert.equal(await bootstrapAdmin(existing, env), "exists");
  assert.equal(existing.writes.length, 0);

  const fresh = fakeClient([]);
  assert.equal(await bootstrapAdmin(fresh, env), "created");
  const [user, workspace] = fresh.writes;
  assert.match(user.sql, /INSERT INTO users\(id,email,password_hash,is_admin\)/);
  assert.equal(user.params[1], "admin@example.test");
  assert(await verifyPassword(env.ADMIN_PASSWORD, user.params[2] as string));
  assert.match(workspace.sql, /INSERT INTO workspaces/);
});

test("bootstrap promotes an existing account without touching its password", async () => {
  const users = [{ email: "admin@example.test", is_admin: false }];
  const client = fakeClient(users);
  assert.equal(await bootstrapAdmin(client, { ...env, ADMIN_PASSWORD: "" }), "promoted");
  assert.equal(users[0].is_admin, true);
  assert.equal(client.writes.length, 0);
});

test("bootstrap accepts exactly the emails that can sign in", () => {
  // 255 characters; long.slice(1) is the 254-character limit.
  const long = `${"a".repeat(61)}@${"b".repeat(180)}.example.test`;
  for (const email of [
    "admin@example.test",
    "first.last+tag@sub.example.test",
    "o'brien@example.test",
    "bad",
    "admin@",
    "@example.test",
    "admin@example",
    ".admin@example.test",
    "admin.@example.test",
    "ad..min@example.test",
    "admin@-example.test",
    long,
    long.slice(1),
  ]) {
    const signIn = credentialsSchema.shape.email.safeParse(email).success;
    assert.equal(validAdminEmail(email), signIn, email);
  }
});

test("bootstrap refuses an invalid ADMIN_EMAIL before writing anything", async () => {
  for (const ADMIN_EMAIL of ["bad", "admin@example", `${"a".repeat(250)}@example.test`]) {
    const client = fakeClient([]);
    await assert.rejects(bootstrapAdmin(client, { ...env, ADMIN_EMAIL }), {
      message: /ADMIN_EMAIL must be a valid email address/,
    });
    assert.equal(client.writes.length, 0);
  }
});

test("bootstrap refuses to create an admin with an unusable password", async () => {
  for (const ADMIN_PASSWORD of ["", "too-short", "x".repeat(129)])
    await assert.rejects(bootstrapAdmin(fakeClient([]), { ...env, ADMIN_PASSWORD }), {
      message: /ADMIN_PASSWORD must be 12 to 128 characters/,
    });
});
