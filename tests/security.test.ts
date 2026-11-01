import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, hashToken, verifyPassword } from "../lib/server/password.ts";
import { credentialsSchema, saveSchema, workspaceSchema } from "../lib/validation.ts";
import { emptyWorkspace } from "../lib/workspace.ts";
import { makeWord } from "../lib/learning.ts";
import { allowedOrigins, cookieOptions, json, requireOrigin } from "../lib/server/http.ts";

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
test("allowed origins are the public origin plus exact aliases", () => {
  assert.deepEqual(allowedOrigins({ APP_ORIGIN: "https://example.com" }), ["https://example.com"]);
  assert.deepEqual(
    allowedOrigins({
      APP_ORIGIN: "https://example.com",
      APP_ORIGIN_ALIASES: " https://www.example.com, http://127.0.0.1:3420 ,",
    }),
    ["https://example.com", "https://www.example.com", "http://127.0.0.1:3420"],
  );
  assert.throws(() => allowedOrigins({}), { status: 503 });
  assert.throws(() => allowedOrigins({ APP_ORIGIN_ALIASES: "https://example.com" }), {
    status: 503,
  });
  for (const bad of ["https://example.com/", "https://Example.com", "example.com", "https://a.b/x"])
    assert.throws(
      () => allowedOrigins({ APP_ORIGIN: "https://example.com", APP_ORIGIN_ALIASES: bad }),
      { status: 503 },
      bad,
    );
});
test("the session cookie's Secure flag follows the request's origin, not APP_ORIGIN", () => {
  const saved = { origin: process.env.APP_ORIGIN, aliases: process.env.APP_ORIGIN_ALIASES };
  const setCookie = (origin: string) => {
    const request = new Request("http://app/api/auth", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
    });
    const response = json({ ok: true });
    response.cookies.set("session", "token", cookieOptions(requireOrigin(request)));
    return response.headers.get("set-cookie")!;
  };
  try {
    process.env.APP_ORIGIN = "http://localhost:3420";
    process.env.APP_ORIGIN_ALIASES = "https://example.com";
    assert.match(setCookie("https://example.com"), /;\s*Secure/i);
    assert.doesNotMatch(setCookie("http://localhost:3420"), /;\s*Secure/i);

    process.env.APP_ORIGIN = "https://example.com";
    process.env.APP_ORIGIN_ALIASES = "http://127.0.0.1:3420";
    assert.doesNotMatch(setCookie("http://127.0.0.1:3420"), /;\s*Secure/i);
    assert.match(setCookie("https://example.com"), /;\s*Secure/i);

    // A misconfigured server answers 503 even to a request without an Origin header.
    delete process.env.APP_ORIGIN;
    assert.throws(() => requireOrigin(new Request("http://app/api/auth", { method: "POST" })), {
      status: 503,
    });
  } finally {
    for (const [key, value] of [
      ["APP_ORIGIN", saved.origin],
      ["APP_ORIGIN_ALIASES", saved.aliases],
    ] as const)
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
