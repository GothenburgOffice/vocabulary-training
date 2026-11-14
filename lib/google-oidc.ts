// Google sign-in (#152) with OpenID Connect: the authorization code flow with PKCE, state and
// nonce. Pure functions, so they can be unit-tested; lib/server/google.ts holds the settings,
// the token request and the account changes.
import { createHash, randomBytes } from "node:crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const CALLBACK_PATH = "/api/auth/google/callback";
export const FLOW_COOKIE = "vocabulary_google";
// How long a started sign-in may take at Google before it has to start again.
export const FLOW_MAX_AGE_S = 600;
// What a client ID looks like (`<number>-<id>.apps.googleusercontent.com`).
export const CLIENT_ID_PATTERN = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/;

export const callbackUrl = (origin: string) => origin + CALLBACK_PATH;

// What the browser keeps between the start and the callback, in a short-lived httpOnly cookie.
export type GoogleFlow = { state: string; nonce: string; verifier: string };
const random = () => randomBytes(32).toString("base64url");
export function newFlow(): GoogleFlow {
  return { state: random(), nonce: random(), verifier: random() };
}
export function encodeFlow(flow: GoogleFlow) {
  return Buffer.from(JSON.stringify(flow)).toString("base64url");
}
export function decodeFlow(value: string | undefined): GoogleFlow | null {
  if (!value || value.length > 1000) return null;
  try {
    const flow = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const ok = (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);
    return ok(flow?.state) && ok(flow?.nonce) && ok(flow?.verifier)
      ? { state: flow.state, nonce: flow.nonce, verifier: flow.verifier }
      : null;
  } catch {
    return null;
  }
}

// Where the start sends the browser. Only openid and email are asked for: not the name or
// photo. select_account lets someone with several Google accounts pick one each time.
export function authorizationUrl(clientId: string, origin: string, flow: GoogleFlow) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(origin),
    response_type: "code",
    scope: "openid email",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: createHash("sha256").update(flow.verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.href;
}

export type GoogleIdentity = { sub: string; email: string };
export type IdentityResult =
  { ok: true; identity: GoogleIdentity } | { ok: false; reason: "invalid" | "email_not_verified" };

// The person Google says signed in, from the ID token of the token response. That response
// comes straight from Google's token endpoint over TLS, in exchange for this app's secret, so
// its signature need not be checked (OpenID Connect Core 3.1.3.7); its claims still are.
export function identityFromIdToken(
  idToken: unknown,
  expected: { clientId: string; nonce: string; now: number },
): IdentityResult {
  const invalid = { ok: false, reason: "invalid" } as const;
  if (typeof idToken !== "string" || idToken.length > 10_000) return invalid;
  const parts = idToken.split(".");
  if (parts.length !== 3) return invalid;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return invalid;
  }
  if (!claims || typeof claims !== "object") return invalid;
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ISSUERS.has(String(claims.iss))) return invalid;
  if (!audience.includes(expected.clientId)) return invalid;
  // With several audiences, or an authorized party at all, it must be this client
  // (OpenID Connect Core 3.1.3.7): a token Google issued to another client never signs in here.
  if ((audience.length > 1 || claims.azp !== undefined) && claims.azp !== expected.clientId)
    return invalid;
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= expected.now) return invalid;
  if (claims.nonce !== expected.nonce) return invalid;
  const sub = claims.sub;
  if (typeof sub !== "string" || !sub || sub.length > 255) return invalid;
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !email.includes("@")) return invalid;
  if (claims.email_verified !== true && claims.email_verified !== "true")
    return { ok: false, reason: "email_not_verified" };
  return { ok: true, identity: { sub, email } };
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
// The token endpoint. Tests replace Google's with a fake (compose.test.yaml) through
// TEST_GOOGLE_TOKEN_URL, honoured only while APP_ORIGIN is plain HTTP on a loopback address,
// so a real site, which needs HTTPS, can never be pointed at it.
export function tokenUrl(env: Record<string, string | undefined> = process.env) {
  const test = env.TEST_GOOGLE_TOKEN_URL?.trim();
  if (!test) return GOOGLE_TOKEN_URL;
  try {
    const origin = new URL(env.APP_ORIGIN ?? "");
    if (origin.protocol === "http:" && LOOPBACK.has(origin.hostname)) return test;
  } catch {}
  return GOOGLE_TOKEN_URL;
}
