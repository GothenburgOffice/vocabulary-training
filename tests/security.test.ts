import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, hashToken, verifyPassword } from "../lib/server/password.ts";
import {
  credentialsSchema,
  PASSWORD_MAX,
  PASSWORD_MIN,
  listSaveSchema,
  profileSchema,
  reviewSchema,
  runSaveSchema,
} from "../lib/validation.ts";
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
test("save requests protect types, limits and language pairs", () => {
  const word = (front = "hej", back = "bonjour") => ({ id: crypto.randomUUID(), front, back });
  const list = { title: "Test", description: "", from: "Swedish", to: "French", words: [word()] };
  const save = (l: object, revision: number | null = null) =>
    listSaveSchema.safeParse({ revision, list: { ...list, ...l } }).success;
  assert(save({}));
  assert(save({}, 3));
  assert.equal(save({}, 0), false);
  assert.equal(save({ to: "Swedish" }), false);
  const w = word();
  assert.equal(save({ words: [w, w] }), false);
  assert.equal(save({ words: [word("")] }), false);
  assert.equal(save({ words: [{ ...word(), id: "w-legacy" }] }), false);
  assert.equal(save({ words: Array.from({ length: 1001 }, () => word()) }), false);
  assert.equal(save({ words: [] }), false);
  assert(save({ words: [{ ...word(), accepted: ["salut", "coucou"] }] }));
  assert.equal(save({ words: [{ ...word(), accepted: [""] }] }), false);
  assert.equal(save({ words: [{ ...word(), accepted: Array(21).fill("x") }] }), false);

  const review = {
    id: crypto.randomUUID(),
    wordId: crypto.randomUUID(),
    direction: "forward",
    correct: true,
  };
  assert(reviewSchema.safeParse(review).success);
  // Every answer carries its own id, so retries can be recognised.
  assert.equal(reviewSchema.safeParse({ ...review, id: undefined }).success, false);
  assert.equal(reviewSchema.safeParse({ ...review, direction: "sideways" }).success, false);
  // The server schedules; the client can't send history or due dates.
  assert.equal(reviewSchema.safeParse({ ...review, due: 0 }).success, false);

  assert(profileSchema.safeParse({ baseLanguage: "Swedish", learningLanguage: "French" }).success);
  assert.equal(
    profileSchema.safeParse({ baseLanguage: "Swedish", learningLanguage: "Swedish" }).success,
    false,
  );

  const run = {
    id: crypto.randomUUID(),
    listId: null,
    title: "Test",
    mode: "adaptive",
    from: "Swedish",
    to: "French",
    completedAt: 1,
    results: [
      { word: word(), answer: "bonjour", correct: true, direction: "forward", answeredAt: 1 },
    ],
  };
  assert(runSaveSchema.safeParse(run).success);
  assert.equal(runSaveSchema.safeParse({ ...run, results: [] }).success, false);
  assert.equal(
    runSaveSchema.safeParse({ ...run, results: [{ ...run.results[0], answer: "x".repeat(501) }] })
      .success,
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
test("passwords accept 12 to 4096 characters, with a clear message outside that", () => {
  const parse = (password: string) =>
    credentialsSchema.safeParse({ action: "register", email: "a@b.com", password });
  assert(parse("x".repeat(PASSWORD_MIN)).success);
  assert(parse("x".repeat(PASSWORD_MAX)).success);
  const short = parse("x".repeat(PASSWORD_MIN - 1));
  assert.equal(short.error?.issues[0].message, "Use a password of at least 12 characters.");
  const long = parse("x".repeat(PASSWORD_MAX + 1));
  assert.equal(long.error?.issues[0].message, "Use a password of at most 4096 characters.");
});
