"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { Privacy } from "../../lib/admin/privacy";
import { adminRequest } from "./request";

type View = Privacy & { ready: boolean };

export default function PrivacySettings() {
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<Privacy>({ controllerName: "", contactEmail: "" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    adminRequest<View>("/api/admin/privacy")
      .then((v) => {
        setView(v);
        setDraft({ controllerName: v.controllerName, contactEmail: v.contactEmail });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setStatus("Saving…");
    try {
      setView(await adminRequest<View>("/api/admin/privacy", "PUT", draft));
      setStatus("Saved.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  if (!view) return error ? <p className="error">{error}</p> : <p>Loading…</p>;
  return (
    <form className="admin-card" onSubmit={(e) => void save(e)}>
      <p className={view.ready ? "field-help" : "error"} role="status">
        {view.ready
          ? "Both are set, so registration can open (it also needs ALLOW_REGISTRATION=true)."
          : "Not set: registration is closed."}
      </p>
      <label className="field">
        Data controller
        <input
          value={draft.controllerName}
          maxLength={200}
          placeholder="Your name or organisation"
          onChange={(e) => setDraft({ ...draft, controllerName: e.target.value })}
        />
        <small>
          The person or organisation that runs this site. Use real, publishable details.
        </small>
      </label>
      <label className="field">
        Privacy contact email
        <input
          type="email"
          value={draft.contactEmail}
          maxLength={254}
          placeholder="privacy@your-domain"
          onChange={(e) => setDraft({ ...draft, contactEmail: e.target.value })}
        />
        <small>Where people send requests about their data. Shown publicly.</small>
      </label>
      <div className="admin-actions">
        <button className="button primary">Save</button>
        {status && <span className="admin-status">{status}</span>}
      </div>
    </form>
  );
}
