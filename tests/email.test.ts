import test from "node:test";
import assert from "node:assert/strict";
import { emailUpdateSchema, testMailSchema } from "../lib/admin/email.ts";

const valid = {
  host: "smtp.example.test",
  port: 587,
  security: "starttls",
  user: "mailer",
  from: "vocabulary.training <no-reply@example.test>",
};

test("admins save the SMTP settings; the password is optional or null to clear it", () => {
  assert.ok(emailUpdateSchema.safeParse(valid).success);
  assert.ok(emailUpdateSchema.safeParse({ ...valid, password: "secret" }).success);
  assert.ok(emailUpdateSchema.safeParse({ ...valid, password: null }).success);
  assert.ok(emailUpdateSchema.safeParse({ ...valid, from: "no-reply@example.test" }).success);
  // Blank host, user and from switch mail off and need no sign-in.
  assert.ok(emailUpdateSchema.safeParse({ ...valid, host: "", user: "", from: "" }).success);
});

test("invalid SMTP settings are refused", () => {
  const bad: Record<string, unknown>[] = [
    { host: "smtp.example.test:587" },
    { host: "http://smtp.example.test" },
    { port: 0 },
    { port: 70000 },
    { port: 587.5 },
    { security: "ssl" },
    { from: "not an address" },
    { from: "Name <no-reply@example.test>\r\nBcc: x@example.test" },
    { user: "a\nb" },
    { password: "" },
    { extra: true },
  ];
  for (const change of bad)
    assert.equal(
      emailUpdateSchema.safeParse({ ...valid, ...change }).success,
      false,
      String(change),
    );
});

test("a test mail needs one valid address", () => {
  assert.ok(testMailSchema.safeParse({ to: "me@example.test" }).success);
  assert.equal(testMailSchema.safeParse({ to: "me" }).success, false);
  assert.equal(testMailSchema.safeParse({ to: "a@example.test, b@example.test" }).success, false);
  assert.equal(testMailSchema.safeParse({}).success, false);
});
