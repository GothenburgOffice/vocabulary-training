"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { GoogleView } from "@/lib/admin/google";
import { adminRequest } from "./request";

// Google sign-in (#152): the OAuth client from Google Cloud. The secret is write-only.
export default function GoogleSettings() {
  const [view, setView] = useState<GoogleView | null>(null);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  function show(v: GoogleView) {
    setView(v);
    setClientId(v.clientId);
    setSecret("");
  }
  useEffect(() => {
    adminRequest<GoogleView>("/api/admin/google")
      .then(show)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function save(update: { clientId: string; clientSecret?: string | null }) {
    setStatus("Saving…");
    try {
      show(await adminRequest<GoogleView>("/api/admin/google", "PUT", update));
      setStatus("Saved.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void save({ clientId: clientId.trim(), ...(secret.trim() ? { clientSecret: secret } : {}) });
  }

  if (!view) return error ? <p className="error">{error}</p> : <p>Loading…</p>;
  const secretText =
    view.secret.state === "set"
      ? `Saved, ending in …${view.secret.hint}`
      : view.secret.state === "unreadable"
        ? "Saved, but it can't be decrypted with the current SETTINGS_ENCRYPTION_KEY. Enter it again."
        : "Not set.";
  return (
    <form className="admin-card" onSubmit={submit} aria-labelledby="google-heading">
      <h2 id="google-heading">Google sign-in</h2>
      <p className={view.enabled ? "field-help" : "error"} role="status">
        {view.enabled
          ? "On: the sign-in page offers Continue with Google."
          : "Off: save a client ID and secret to offer it."}
      </p>
      <p className="field-help">
        In Google Cloud, create an OAuth client of type Web application with this authorized
        redirect URI. Members who sign in with Google lose their password; this site has no password
        recovery, so if Google sign-in is switched off they can&apos;t sign in until it is back.
      </p>
      <label className="field">
        Authorized redirect URI
        <input readOnly value={view.redirectUri} onFocus={(e) => e.target.select()} />
      </label>
      <label className="field">
        Client ID
        <input
          value={clientId}
          maxLength={200}
          autoComplete="off"
          placeholder="…apps.googleusercontent.com"
          onChange={(e) => setClientId(e.target.value)}
        />
      </label>
      <label className="field">
        Client secret
        <input
          type="password"
          autoComplete="off"
          value={secret}
          maxLength={500}
          disabled={!view.encryptionReady}
          placeholder={view.secret.state === "set" ? "Enter a new secret to replace it" : ""}
          onChange={(e) => setSecret(e.target.value)}
        />
        <small>
          {view.encryptionReady
            ? secretText
            : "Set SETTINGS_ENCRYPTION_KEY on the server before saving a secret."}
        </small>
      </label>
      <div className="admin-actions">
        <button className="button primary">Save</button>
        {(view.clientId || view.secret.state !== "unset") && (
          <button
            type="button"
            className="button"
            onClick={() => void save({ clientId: "", clientSecret: null })}
          >
            Remove client
          </button>
        )}
        {status && <span className="admin-status">{status}</span>}
      </div>
    </form>
  );
}
