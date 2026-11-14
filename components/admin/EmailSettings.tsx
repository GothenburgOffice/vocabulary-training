"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  DEFAULT_PORT,
  SMTP_SECURITY,
  SMTP_SECURITY_LABELS,
  type EmailView,
  type SmtpSecurity,
} from "@/lib/admin/email";
import { adminRequest } from "./request";

// Outgoing mail (SMTP) for sign-up and password reset mail. The password is write-only. The
// test mail is sent with the saved settings, so save first.
export default function EmailSettings() {
  const [view, setView] = useState<EmailView | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [security, setSecurity] = useState<SmtpSecurity>("starttls");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [from, setFrom] = useState("");
  const [status, setStatus] = useState("");
  const [to, setTo] = useState("");
  const [testStatus, setTestStatus] = useState("");
  const [error, setError] = useState("");
  function show(v: EmailView) {
    setView(v);
    setHost(v.host);
    setPort(String(v.port));
    setSecurity(v.security);
    setUser(v.user);
    setFrom(v.from);
    setPassword("");
  }
  useEffect(() => {
    adminRequest<EmailView>("/api/admin/email")
      .then(show)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function save(update: Record<string, unknown>) {
    setStatus("Saving…");
    try {
      show(await adminRequest<EmailView>("/api/admin/email", "PUT", update));
      setStatus("Saved.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void save({
      host: host.trim(),
      port: Number(port),
      security,
      user: user.trim(),
      from: from.trim(),
      ...(password ? { password } : {}),
    });
  }
  async function sendTest(event: FormEvent) {
    event.preventDefault();
    setTestStatus("Sending…");
    try {
      await adminRequest("/api/admin/email/test", "POST", { to: to.trim() });
      setTestStatus(`Test mail sent to ${to.trim()}.`);
    } catch (e) {
      setTestStatus((e as Error).message);
    }
  }

  if (!view) return error ? <p className="error">{error}</p> : <p>Loading…</p>;
  const passwordText =
    view.password.state === "set"
      ? `Saved, ending in …${view.password.hint}`
      : view.password.state === "unreadable"
        ? "Saved, but it can't be decrypted with the current SETTINGS_ENCRYPTION_KEY. Enter it again."
        : "Not set.";
  return (
    <>
      <form className="admin-card" onSubmit={submit} aria-labelledby="email-heading">
        <h2 id="email-heading">SMTP server</h2>
        <p className={view.enabled ? "field-help" : "error"} role="status">
          {view.enabled
            ? "On: sign-up and password reset mail can be sent."
            : "Off: save a host and a from address to send mail."}
        </p>
        <label className="field">
          Host
          <input
            value={host}
            maxLength={253}
            autoComplete="off"
            placeholder="smtp.example.com"
            onChange={(e) => setHost(e.target.value)}
          />
        </label>
        <label className="field">
          Security
          <select
            value={security}
            onChange={(e) => {
              const next = e.target.value as SmtpSecurity;
              // Follow the usual port while it still is another mode's usual port.
              if (Object.values(DEFAULT_PORT).includes(Number(port)))
                setPort(String(DEFAULT_PORT[next]));
              setSecurity(next);
            }}
          >
            {SMTP_SECURITY.filter(
              (s) => s !== "none" || view.plaintextAllowed || security === "none",
            ).map((s) => (
              <option key={s} value={s}>
                {SMTP_SECURITY_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Port
          <input
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(e) => setPort(e.target.value)}
          />
        </label>
        <label className="field">
          User name
          <input
            value={user}
            maxLength={254}
            autoComplete="off"
            onChange={(e) => setUser(e.target.value)}
          />
          <small>Leave blank for a server without sign-in.</small>
        </label>
        <label className="field">
          Password
          <input
            type="password"
            autoComplete="off"
            value={password}
            maxLength={500}
            disabled={!view.encryptionReady}
            placeholder={view.password.state === "set" ? "Enter a new password to replace it" : ""}
            onChange={(e) => setPassword(e.target.value)}
          />
          <small>
            {view.encryptionReady
              ? passwordText
              : "Set SETTINGS_ENCRYPTION_KEY on the server before saving a password."}
          </small>
        </label>
        <label className="field">
          From address
          <input
            value={from}
            maxLength={254}
            autoComplete="off"
            placeholder="vocabulary.training <no-reply@example.com>"
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <div className="admin-actions">
          <button className="button primary">Save</button>
          {view.password.state !== "unset" && (
            <button
              type="button"
              className="button"
              onClick={() =>
                void save({ host, port: Number(port), security, user, from, password: null })
              }
            >
              Remove password
            </button>
          )}
          {status && <span className="admin-status">{status}</span>}
        </div>
      </form>
      <form className="admin-card" onSubmit={sendTest} aria-labelledby="test-mail-heading">
        <h2 id="test-mail-heading">Test mail</h2>
        <p className="field-help">
          Sends a test mail with the saved settings. Save any changes above first.
        </p>
        <label className="field">
          Send to
          <input
            type="email"
            required
            value={to}
            maxLength={254}
            autoComplete="email"
            placeholder="you@example.com"
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <div className="admin-actions">
          <button className="button primary" disabled={!view.enabled}>
            Send test mail
          </button>
          {testStatus && (
            <span className="admin-status" role="status">
              {testStatus}
            </span>
          )}
        </div>
      </form>
    </>
  );
}
