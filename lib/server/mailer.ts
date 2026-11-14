import "server-only";
import nodemailer from "nodemailer";
import { mailFailure, plaintextAllowed } from "@/lib/smtp";
import { HttpError } from "./http";
import { readSmtpConfig } from "./site-settings";

// Sends one plain-text mail with the SMTP settings saved in Admin → Email. Sign-up and
// password reset mails go through here. Throws a 409 while mail is off and a 502 with a fixed
// reason when sending fails: the mail server's own text never leaves this function.
export async function sendMail(message: { to: string; subject: string; text: string }) {
  const config = await readSmtpConfig();
  if (!config) throw new HttpError(409, "Email is off: save a host and a from address first.");
  // Refused here too, in case settings saved on a test stack outlive it.
  if (config.security === "none" && !plaintextAllowed())
    throw new HttpError(409, "Mail must use TLS: choose STARTTLS or TLS from the start.");
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.security === "tls",
    requireTLS: config.security === "starttls",
    ignoreTLS: config.security === "none",
    auth: config.user ? { user: config.user, pass: config.password } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  try {
    await transport.sendMail({
      from: config.from,
      ...message,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  } catch (e) {
    throw new HttpError(502, mailFailure(e));
  } finally {
    transport.close();
  }
}
