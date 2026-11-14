// The rules for outgoing mail that don't need the database: shared by the admin page, the
// save route and the mailer, and unit-tested.
import type { SmtpSecurity } from "./admin/email";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Whether SMTP without TLS may be used. Only test and local stacks: they set
// TEST_SMTP_PLAINTEXT (compose.test.yaml) to point at a capture-only fake server, and it is
// honoured only while APP_ORIGIN is plain HTTP on a loopback address, so a real site, which
// needs HTTPS, can never send credentials or mail unencrypted.
export function plaintextAllowed(env: Record<string, string | undefined> = process.env) {
  if (env.TEST_SMTP_PLAINTEXT !== "1") return false;
  try {
    const origin = new URL(env.APP_ORIGIN ?? "");
    return origin.protocol === "http:" && LOOPBACK.has(origin.hostname);
  } catch {
    return false;
  }
}

// What is wrong with a settings combination, or "" when it is fine. A user name needs its
// password and the other way round, and a server without TLS needs plaintextAllowed().
export function smtpProblem(
  settings: { user: string; hasPassword: boolean; security: SmtpSecurity },
  allowPlaintext: boolean,
) {
  if (settings.security === "none" && !allowPlaintext)
    return "Mail must use TLS: choose STARTTLS or TLS from the start.";
  if (Boolean(settings.user) !== settings.hasPassword)
    return "Enter a user name and a password together, or neither.";
  return "";
}

// The answer for a failed send. Fixed text per kind of failure: the mail server's own words
// never reach the page, the way MoneyWorks does it.
export function mailFailure(error: unknown) {
  const code = String((error as { code?: unknown }).code ?? "");
  if (code === "EAUTH" || code === "ENOAUTH")
    return "The mail server refused the user name or password.";
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ETLS", "EPROTOCOL"].includes(code))
    return "The mail server could not be reached, or TLS failed.";
  if (code === "EENVELOPE" || code === "EMESSAGE")
    return "The mail server refused the sender or recipient address.";
  return "The mail could not be sent.";
}
