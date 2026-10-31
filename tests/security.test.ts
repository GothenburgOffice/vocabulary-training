import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, hashToken, verifyPassword } from "../lib/server/password.ts";
import { credentialsSchema, saveSchema, workspaceSchema } from "../lib/validation.ts";
import { emptyWorkspace } from "../lib/workspace.ts";
import { makeWord } from "../lib/learning.ts";

test("salted password hashes verify without storing plaintext", async () => {
  const pass = "test-only-example-passphrase";
  const first = await hashPassword(pass),
    second = await hashPassword(pass);
  assert.notEqual(first, second);
  assert(!first.includes(pass));
  assert(await verifyPassword(pass, first));
  assert.equal(await verifyPassword("not-the-same-password", first), false);
  assert.equal(await verifyPassword(pass, "invalid"), false);
  assert.equal(hashToken("token").length, 64);
});
test("credentials enforce password size and normalize email", () => {
  assert.equal(
    credentialsSchema.parse({
      action: "register",
      email: " TEST@example.com ",
      password: "long-enough-password",
    }).email,
    "test@example.com",
  );
  assert.equal(
    credentialsSchema.safeParse({ action: "login", email: "a@b.com", password: "short" }).success,
    false,
  );
  assert.equal(
    credentialsSchema.safeParse({ action: "login", email: "bad", password: "x".repeat(12) })
      .success,
    false,
  );
});
test("workspace validation protects types, limits and language pairs", () => {
  assert(workspaceSchema.safeParse(emptyWorkspace()).success);
  assert.equal(
    workspaceSchema.safeParse({ ...emptyWorkspace(), learningLanguage: "Swedish" }).success,
    false,
  );
  assert.equal(saveSchema.safeParse({ revision: -1, data: emptyWorkspace() }).success, false);
  const w = makeWord("hej", "bonjour", "same");
  const l = { id: "l", title: "Test", description: "", from: "Swedish", to: "French", words: [w] };
  assert(workspaceSchema.safeParse({ ...emptyWorkspace(), lists: [l] }).success);
  assert.equal(workspaceSchema.safeParse({ ...emptyWorkspace(), lists: [l, l] }).success, false);
  assert.equal(
    workspaceSchema.safeParse({ ...emptyWorkspace(), lists: [{ ...l, words: [w, w] }] }).success,
    false,
  );
  assert.equal(
    workspaceSchema.safeParse({
      ...emptyWorkspace(),
      lists: [{ ...l, words: [{ ...w, front: "" }] }],
    }).success,
    false,
  );
});
