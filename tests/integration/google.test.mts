import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api, base, origin } from "./helpers.mts";

// Google sign-in (#152) end to end, with compose.test.yaml's fake token endpoint in Google's
// place: the authorization code carries the claims the fake puts in the ID token.
const adminEmail = process.env.TEST_ADMIN_EMAIL;
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
const clientId = "1234-test.apps.googleusercontent.com";
const code = (claims: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(claims)).toString("base64url");
const cookieFrom = (response: Response, name: string) =>
  response.headers
    .getSetCookie()
    .map((set) => set.split(";")[0])
    .find((pair) => pair.startsWith(`${name}=`) && pair.length > name.length + 1) ?? "";
const fresh = (prefix: string) => `${prefix}-${randomUUID()}@example.test`;

function start(from = origin) {
  return fetch(`${base}/api/auth/google`, {
    method: "POST",
    redirect: "manual",
    headers: { Origin: from, "Content-Type": "application/x-www-form-urlencoded" },
    body: "",
  });
}
// One Google sign-in, as a fresh browser: start, "Google" answers, callback. `claims` are what
// Google says; overrides change the callback request.
async function google(
  claims: Record<string, unknown>,
  overrides: { state?: string; cookie?: string; error?: boolean } = {},
) {
  const started = await start();
  assert.equal(started.status, 303);
  const at = new URL(started.headers.get("location")!);
  const flow = cookieFrom(started, "vocabulary_google");
  const state = overrides.state ?? at.searchParams.get("state");
  const query = overrides.error
    ? `error=access_denied&state=${state}`
    : `code=${code({ nonce: at.searchParams.get("nonce"), email_verified: true, ...claims })}&state=${state}`;
  const back = await fetch(`${base}/api/auth/google/callback?${query}`, {
    redirect: "manual",
    headers: { Cookie: overrides.cookie ?? flow },
  });
  assert.equal(back.status, 303);
  const location = new URL(back.headers.get("location")!);
  return {
    reason: location.searchParams.get("google"),
    path: location.pathname,
    session: cookieFrom(back, "vocabulary_session"),
  };
}
async function me(cookie: string) {
  const response = await api("/api/auth", "GET", undefined, cookie);
  return response.ok ? (await response.json()).user : null;
}
async function refused(outcome: Awaited<ReturnType<typeof google>>, reason: string) {
  assert.equal(outcome.reason, reason);
  assert.equal(outcome.session, "", `no session after ${reason}`);
}

test(
  "real HTTP: Google sign-in creates, links and protects accounts, against a fake Google",
  { skip: !adminEmail || !adminPassword || process.env.TEST_WRITE_SITE_SETTINGS !== "1" },
  async () => {
    // Off without a client: no button, and a start goes back with a reason.
    let status = await (await api("/api/auth/google")).json();
    assert.equal(status.enabled, false);
    let started = await start();
    assert.equal(started.status, 303);
    assert.equal(
      new URL(started.headers.get("location")!).searchParams.get("google"),
      "unavailable",
    );

    const login = await api("/api/auth", "POST", {
      action: "login",
      email: adminEmail,
      password: adminPassword,
    });
    assert.equal(login.status, 200);
    const admin = login.headers.get("set-cookie")!.split(";")[0];
    try {
      // The client is saved at /admin; the secret is encrypted and never shown again.
      let response = await api("/api/admin/google", "PUT", { clientId: "not-a-client-id" }, admin);
      assert.equal(response.status, 400);
      response = await api(
        "/api/admin/google",
        "PUT",
        { clientId, clientSecret: "google-test-only-client-secret" },
        admin,
      );
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.ok(!text.includes("google-test-only-client-secret"));
      const view = JSON.parse(text);
      assert.equal(view.enabled, true);
      assert.deepEqual(view.secret, { state: "set", hint: "cret" });
      assert.equal(view.redirectUri, `${origin}/api/auth/google/callback`);
      assert.equal((await api("/api/admin/google")).status, 404, "admins only");
      // A new client ID needs its own secret: the old one would belong to the old client.
      response = await api(
        "/api/admin/google",
        "PUT",
        { clientId: "5678-other.apps.googleusercontent.com" },
        admin,
      );
      assert.equal(response.status, 400);
      // The same ID without a secret keeps the saved one.
      response = await api("/api/admin/google", "PUT", { clientId }, admin);
      assert.equal((await response.json()).enabled, true);
      status = await (await api("/api/auth/google")).json();
      assert.deepEqual(status, { enabled: true, origin });
      assert.match(await (await api("/privacy")).text(), /Signing in with Google/);

      // The start goes only to Google, with this app's client and redirect, and a flow cookie.
      started = await start();
      const at = new URL(started.headers.get("location")!);
      assert.equal(at.origin, "https://accounts.google.com");
      assert.equal(at.searchParams.get("client_id"), clientId);
      assert.equal(at.searchParams.get("redirect_uri"), `${origin}/api/auth/google/callback`);
      const flowCookie = started.headers
        .getSetCookie()
        .find((c) => c.startsWith("vocabulary_google="))!;
      assert.match(flowCookie, /HttpOnly/i);
      assert.match(flowCookie, /SameSite=Lax/i);
      assert.match(flowCookie, /Path=\/api\/auth\/google/);
      assert.equal((await start("https://attacker.invalid")).status, 403);

      // A new address registers (registration is open on this stack), verified by Google.
      const sub = `google-${randomUUID()}`;
      const email = fresh("google");
      let result = await google({ sub, email });
      assert.deepEqual([result.reason, result.path], [null, "/"]);
      const user = await me(result.session);
      assert.equal(user.email, email);
      const exported = await (await api("/api/export", "GET", undefined, result.session)).json();
      assert.equal(exported.account.googleAccountId, sub);
      // Google's account ID, not the address, finds the account the next time.
      result = await google({ sub, email: fresh("changed") });
      assert.equal((await me(result.session)).id, user.id);
      // No password signs in to it.
      response = await api("/api/auth", "POST", {
        action: "login",
        email,
        password: "integration-test-only-password",
      });
      assert.equal(response.status, 401);

      // Someone registered another person's address with a password first. When the owner
      // signs in with Google, that password and every session of the account go.
      const victim = fresh("victim");
      const squatter = await api("/api/auth", "POST", {
        action: "register",
        email: victim,
        password: "squatter-test-only-password",
      });
      assert.equal(squatter.status, 200);
      const squatterSession = squatter.headers.get("set-cookie")!.split(";")[0];
      assert.equal((await me(squatterSession)).email, victim);
      result = await google({ sub: `google-${randomUUID()}`, email: victim });
      assert.equal(result.reason, null);
      assert.equal((await me(result.session)).email, victim);
      assert.equal(await me(squatterSession), null, "the squatter's session ended");
      response = await api("/api/auth", "POST", {
        action: "login",
        email: victim,
        password: "squatter-test-only-password",
      });
      assert.equal(response.status, 401, "the squatter's password is gone");

      // Refusals: back on the sign-in page with a reason, and no session.
      await refused(
        await google({ sub: `google-${randomUUID()}`, email: fresh("u"), email_verified: false }),
        "not-verified",
      );
      // The address is another Google account's.
      await refused(await google({ sub: `google-${randomUUID()}`, email: user.email }), "linked");
      await refused(await google({ sub, email }, { state: "a".repeat(43) }), "expired");
      await refused(await google({ sub, email }, { cookie: "" }), "expired");
      await refused(await google({ sub, email }, { error: true }), "cancelled");
      await refused(await google({ sub, email, nonce: "n".repeat(43) }), "failed");
      await refused(
        await google({ sub, email, aud: "9999-other.apps.googleusercontent.com" }),
        "failed",
      );

      // New members need registration open, like password ones; existing ones still sign in.
      const registration = await (
        await api("/api/admin/registration", "GET", undefined, admin)
      ).json();
      const { controllerName, contactEmail } = registration;
      const setOpen = (open: boolean) =>
        api("/api/admin/registration", "PUT", { open, controllerName, contactEmail }, admin);
      await setOpen(false);
      try {
        await refused(
          await google({ sub: `google-${randomUUID()}`, email: fresh("closed") }),
          "closed",
        );
        assert.equal((await google({ sub, email })).reason, null);
      } finally {
        await setOpen(registration.open);
      }

      // A locked account can't sign in with Google either.
      response = await api("/api/admin/users", "PATCH", { userId: user.id, locked: true }, admin);
      assert.equal(response.status, 200, await response.clone().text());
      await refused(await google({ sub, email }), "locked");
      await api("/api/admin/users", "PATCH", { userId: user.id, locked: false }, admin);
      assert.equal((await google({ sub, email })).reason, null);
    } finally {
      // Off again, so other tests on this stack see the sign-in page without Google.
      await api("/api/admin/google", "PUT", { clientId: "", clientSecret: null }, admin);
    }
    status = await (await api("/api/auth/google")).json();
    assert.equal(status.enabled, false);
  },
);
