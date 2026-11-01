"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { Privacy, RegistrationView } from "../../lib/admin/registration";
import { adminRequest } from "./request";

type Draft = Privacy & { open: boolean };

export default function RegistrationSettings() {
  const [view, setView] = useState<RegistrationView | null>(null);
  const [draft, setDraft] = useState<Draft>({ open: false, controllerName: "", contactEmail: "" });
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  function show(v: RegistrationView) {
    setView(v);
    setDraft({ open: v.open, controllerName: v.controllerName, contactEmail: v.contactEmail });
  }
  useEffect(() => {
    adminRequest<RegistrationView>("/api/admin/registration")
      .then(show)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setStatus("Saving…");
    try {
      show(await adminRequest<RegistrationView>("/api/admin/registration", "PUT", draft));
      setStatus("Saved.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  if (!view) return error ? <p className="error">{error}</p> : <p>Loading…</p>;
  const usable = view.open && !view.blockers.length;
  return (
    <form className="admin-card" onSubmit={(e) => void save(e)}>
      <p className={usable ? "field-help" : "error"} role="status">
        {usable
          ? "Registration is open: anyone can create an account."
          : view.open
            ? "Registration is switched on, but stays closed until the list below is done."
            : "Registration is closed."}
      </p>
      {view.blockers.length > 0 && (
        <ul className="admin-checklist">
          {view.blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      )}
      <label className="admin-check">
        <input
          type="checkbox"
          checked={draft.open}
          // Switching on needs a complete checklist; switching off always works.
          disabled={!view.open && view.blockers.length > 0}
          onChange={(e) => setDraft({ ...draft, open: e.target.checked })}
        />
        Open registration
      </label>
      <label className="field">
        Data controller
        <input
          value={draft.controllerName}
          maxLength={200}
          placeholder="Your name or organisation"
          onChange={(e) => setDraft({ ...draft, controllerName: e.target.value })}
        />
        <small>
          The person or organisation that runs this site, shown on the{" "}
          <a href="/privacy">privacy page</a>. Use real, publishable details.
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
