import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  authorizationUrl,
  CLIENT_ID_PATTERN,
  decodeFlow,
  encodeFlow,
  GOOGLE_TOKEN_URL,
  identityFromIdToken,
  newFlow,
  tokenUrl,
} from "../lib/google-oidc.ts";

const clientId = "1234-test.apps.googleusercontent.com";
const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Date.parse("2026-11-14T12:00:00Z");
const claims = {
  iss: "https://accounts.google.com",
  aud: clientId,
  exp: now / 1000 + 600,
  nonce: "n".repeat(43),
  sub: "112233",
  email: " Person@Example.test ",
  email_verified: true,
};
const token = (overrides: Record<string, unknown> = {}) =>
  `${part({ alg: "RS256" })}.${part({ ...claims, ...overrides })}.signature`;
const expected = { clientId, nonce: claims.nonce, now };

test("the start sends Google only openid and email, with state, nonce and PKCE", () => {
  const flow = newFlow();
  const url = new URL(authorizationUrl(clientId, "https://vocabulary.example", flow));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  const p = url.searchParams;
  assert.equal(p.get("client_id"), clientId);
  assert.equal(p.get("redirect_uri"), "https://vocabulary.example/api/auth/google/callback");
  assert.equal(p.get("response_type"), "code");
  assert.equal(p.get("scope"), "openid email");
  assert.equal(p.get("state"), flow.state);
  assert.equal(p.get("nonce"), flow.nonce);
  assert.equal(p.get("code_challenge_method"), "S256");
  assert.equal(
    p.get("code_challenge"),
    createHash("sha256").update(flow.verifier).digest("base64url"),
  );
  assert.equal(p.get("prompt"), "select_account");
  // The verifier itself never leaves the browser's cookie and the server.
  assert.ok(!url.href.includes(flow.verifier));
});

test("each flow is new, and the cookie round-trips only a well-formed flow", () => {
  const a = newFlow();
  const b = newFlow();
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.nonce, b.nonce);
  assert.deepEqual(decodeFlow(encodeFlow(a)), a);
  for (const bad of [undefined, "", "not base64 json", part({ state: "x", nonce: "y" })])
    assert.equal(decodeFlow(bad), null);
  assert.equal(decodeFlow(part({ ...a, state: "short" })), null);
  assert.equal(decodeFlow("a".repeat(1001)), null);
});

test("the ID token gives Google's account ID and the verified address, lower-cased", () => {
  assert.deepEqual(identityFromIdToken(token(), expected), {
    ok: true,
    identity: { sub: "112233", email: "person@example.test" },
  });
  // Google's other issuer spelling, an audience list, and "true" as a string are accepted.
  assert.equal(
    identityFromIdToken(
      token({ iss: "accounts.google.com", aud: [clientId], email_verified: "true" }),
      expected,
    ).ok,
    true,
  );
});

test("an ID token for another app, issuer, sign-in or time is refused", () => {
  const invalid = { ok: false, reason: "invalid" };
  for (const overrides of [
    { aud: "9999-other.apps.googleusercontent.com" },
    { iss: "https://attacker.example" },
    { nonce: "m".repeat(43) },
    { exp: now / 1000 - 1 },
    { exp: "later" },
    { sub: "" },
    { sub: 12 },
    { email: "" },
    { email: "no-at-sign" },
  ])
    assert.deepEqual(
      identityFromIdToken(token(overrides), expected),
      invalid,
      JSON.stringify(overrides),
    );
  for (const bad of [undefined, 42, "", "one.two", "a.%%%.c", `x.${"a".repeat(10_001)}.y`])
    assert.deepEqual(identityFromIdToken(bad, expected), invalid);
});

test("an address Google hasn't verified is refused with its own reason", () => {
  for (const email_verified of [false, "false", undefined])
    assert.deepEqual(identityFromIdToken(token({ email_verified }), expected), {
      ok: false,
      reason: "email_not_verified",
    });
});

test("the fake token endpoint is used only on a plain-HTTP loopback origin", () => {
  const fake = "http://fake-google:4500/token";
  assert.equal(tokenUrl({}), GOOGLE_TOKEN_URL);
  assert.equal(tokenUrl({ TEST_GOOGLE_TOKEN_URL: fake }), GOOGLE_TOKEN_URL);
  for (const APP_ORIGIN of ["http://127.0.0.1:3013", "http://localhost:3420", "http://[::1]:3000"])
    assert.equal(tokenUrl({ TEST_GOOGLE_TOKEN_URL: fake, APP_ORIGIN }), fake, APP_ORIGIN);
  for (const APP_ORIGIN of [
    "https://vocabulary.training",
    "https://localhost:3420",
    "http://vocabulary.example",
    "http://10.0.0.5:3420",
    "not a url",
  ])
    assert.equal(
      tokenUrl({ TEST_GOOGLE_TOKEN_URL: fake, APP_ORIGIN }),
      GOOGLE_TOKEN_URL,
      APP_ORIGIN,
    );
});

test("client IDs look like Google's", () => {
  assert.match("1234-test.apps.googleusercontent.com", CLIENT_ID_PATTERN);
  assert.match("123456789012-abc123def456ghi789.apps.googleusercontent.com", CLIENT_ID_PATTERN);
  for (const bad of [
    "not-a-client-id",
    "1234-test.apps.googleusercontent.com.evil",
    "x.apps.googleusercontent.com",
  ])
    assert.doesNotMatch(bad, CLIENT_ID_PATTERN);
});
