import test from "node:test";
import assert from "node:assert/strict";
import { mailFailure, plaintextAllowed, smtpProblem } from "../lib/smtp.ts";

test("plain SMTP is allowed only on a test flag and a plain-HTTP loopback origin", () => {
  const on = { TEST_SMTP_PLAINTEXT: "1" };
  assert.equal(plaintextAllowed({}), false);
  assert.equal(plaintextAllowed({ APP_ORIGIN: "http://127.0.0.1:3013" }), false, "no flag");
  for (const APP_ORIGIN of ["http://127.0.0.1:3013", "http://localhost:3420", "http://[::1]:3000"])
    assert.equal(plaintextAllowed({ ...on, APP_ORIGIN }), true, APP_ORIGIN);
  for (const APP_ORIGIN of [
    "https://vocabulary.training",
    "https://localhost:3420",
    "http://vocabulary.example",
    "http://10.0.0.5:3420",
    "not a url",
    "",
  ])
    assert.equal(plaintextAllowed({ ...on, APP_ORIGIN }), false, APP_ORIGIN);
  assert.equal(
    plaintextAllowed({ TEST_SMTP_PLAINTEXT: "true", APP_ORIGIN: "http://localhost" }),
    false,
  );
});

test("mail needs TLS outside test stacks, and a user name comes with its password", () => {
  const tls = { user: "mailer", hasPassword: true, security: "starttls" } as const;
  assert.equal(smtpProblem(tls, false), "");
  assert.equal(smtpProblem({ ...tls, security: "tls" }, false), "");
  assert.equal(smtpProblem({ user: "", hasPassword: false, security: "starttls" }, false), "");
  assert.match(smtpProblem({ ...tls, security: "none" }, false), /TLS/);
  assert.equal(smtpProblem({ ...tls, security: "none" }, true), "");
  assert.match(smtpProblem({ ...tls, hasPassword: false }, false), /together/);
  assert.match(smtpProblem({ ...tls, user: "" }, false), /together/);
});

test("a failed send is reported in fixed words, never the server's own text", () => {
  const fail = (code: string) =>
    mailFailure(Object.assign(new Error("550 secret detail"), { code }));
  assert.match(fail("EAUTH"), /user name or password/);
  assert.match(fail("ECONNECTION"), /could not be reached/);
  assert.match(fail("ETIMEDOUT"), /could not be reached/);
  assert.match(fail("EENVELOPE"), /address/);
  assert.equal(fail("EWHATEVER"), "The mail could not be sent.");
  assert.equal(mailFailure(new Error("no code")), "The mail could not be sent.");
  for (const code of ["EAUTH", "ECONNECTION", "EENVELOPE", "X"])
    assert.ok(!fail(code).includes("secret"));
});
