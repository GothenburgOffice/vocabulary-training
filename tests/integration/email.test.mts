import test from "node:test";
import assert from "node:assert/strict";
import { api } from "./helpers.mts";

// Outgoing mail (Admin → Email) end to end, with compose.test.yaml's capture-only SMTP server
// (tests/support/fake-smtp.mjs) in place of a real one. The app sees it as SMTP_HOST:2525; the
// test reads what it captured over HTTP at MAILBOX.
const adminEmail = process.env.TEST_ADMIN_EMAIL;
const adminPassword = process.env.TEST_ADMIN_PASSWORD;
const SMTP_HOST = process.env.TEST_SMTP_HOST ?? "fake-smtp";
const MAILBOX = process.env.TEST_MAILBOX_URL ?? "http://127.0.0.1:8025";

type Captured = { user: string; from: string; to: string[]; data: string };
const mailbox = async (): Promise<Captured[]> => (await fetch(`${MAILBOX}/messages`)).json();

test(
  "real HTTP: admins save SMTP settings and the test mail is delivered, or refused in fixed words",
  { skip: !adminEmail || !adminPassword || process.env.TEST_WRITE_SITE_SETTINGS !== "1" },
  async () => {
    const login = await api("/api/auth", "POST", {
      action: "login",
      email: adminEmail,
      password: adminPassword,
    });
    assert.equal(login.status, 200);
    const admin = login.headers.get("set-cookie")!.split(";")[0];
    const settings = {
      host: SMTP_HOST,
      port: 2525,
      security: "none",
      user: "mailer",
      from: "Test <no-reply@example.test>",
    };
    const off = { ...settings, host: "", from: "", user: "", password: null };
    const sendTest = (to: string) => api("/api/admin/email/test", "POST", { to }, admin);
    try {
      assert.equal((await api("/api/admin/email")).status, 404, "admins only");
      assert.equal(
        (await api("/api/admin/email/test", "POST", { to: "me@example.test" })).status,
        404,
      );

      // Off until a host and a from address are saved: the test mail says so.
      await api("/api/admin/email", "PUT", off, admin);
      assert.equal((await sendTest("me@example.test")).status, 409);

      // Invalid settings are refused, and a user name needs its password.
      let response = await api("/api/admin/email", "PUT", { ...settings, port: 0 }, admin);
      assert.equal(response.status, 400);
      response = await api("/api/admin/email", "PUT", settings, admin);
      assert.equal(response.status, 400, "a user name without a password");
      response = await api("/api/admin/email", "PUT", { ...off, password: "x-only" }, admin);
      assert.equal(response.status, 200, "off, so nothing is checked");

      // Saved: the password is encrypted and never sent back.
      response = await api(
        "/api/admin/email",
        "PUT",
        { ...settings, password: "smtp-test-only" },
        admin,
      );
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.ok(!text.includes("smtp-test-only"), "the password is never sent back");
      const view = JSON.parse(text);
      assert.equal(view.enabled, true);
      assert.equal(view.plaintextAllowed, true, "the test stack allows the fake server");
      assert.deepEqual(view.password, { state: "set", hint: "only" });

      // Delivered with the saved settings, signed in as the saved user.
      await fetch(`${MAILBOX}/messages`, { method: "DELETE" });
      assert.equal((await sendTest("not-an-address")).status, 400);
      response = await sendTest("me@example.test");
      assert.equal(response.status, 200, await response.clone().text());
      const [mail, ...rest] = await mailbox();
      assert.equal(rest.length, 0);
      assert.equal(mail.user, "mailer");
      assert.equal(mail.from, "no-reply@example.test");
      assert.deepEqual(mail.to, ["me@example.test"]);
      assert.match(mail.data, /Subject: Test mail from vocabulary\.training/);
      assert.match(mail.data, /If you can read it, the outgoing mail settings work/);

      // Saving without a password keeps it; a refused sign-in is reported in fixed words.
      response = await api("/api/admin/email", "PUT", settings, admin);
      assert.deepEqual((await response.json()).password, { state: "set", hint: "only" });
      await api("/api/admin/email", "PUT", { ...settings, password: "wrong-password" }, admin);
      response = await sendTest("me@example.test");
      assert.equal(response.status, 502);
      assert.match((await response.json()).error, /user name or password/);

      // Nothing listens on port 1: the answer is the fixed "could not be reached", not the
      // system's error text.
      await api(
        "/api/admin/email",
        "PUT",
        { ...settings, port: 1, password: "smtp-test-only" },
        admin,
      );
      response = await sendTest("me@example.test");
      assert.equal(response.status, 502);
      assert.match((await response.json()).error, /could not be reached/);
    } finally {
      await api("/api/admin/email", "PUT", off, admin);
    }
  },
);
