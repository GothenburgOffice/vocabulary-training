"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { WriteLimits } from "../../lib/write-limits";
import { adminRequest } from "./request";

type View = { limits: WriteLimits; defaults: WriteLimits };
const ROWS: { key: keyof WriteLimits; label: string; help: string }[] = [
  {
    key: "perHour",
    label: "Saves per hour",
    help: "A person answering as fast as possible makes about 3,600.",
  },
  {
    key: "perDay",
    label: "Saves per day",
    help: "Well above a person practising non-stop for 24 hours.",
  },
];

// The write limit per account, with an explicit save like the rest of admin.
export default function WriteLimitsSettings() {
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<WriteLimits | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  function show(v: View) {
    setView(v);
    setDraft(v.limits);
  }
  useEffect(() => {
    adminRequest<View>("/api/admin/limits/writes")
      .then(show)
      .catch((e: Error) => setError(e.message));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setStatus("Saving…");
    try {
      show(await adminRequest<View>("/api/admin/limits/writes", "PUT", draft));
      setStatus("Saved.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }
  if (!view || !draft) return error ? <p className="error">{error}</p> : <p>Loading…</p>;
  const number = (value: string) => (value.trim() === "" ? NaN : Number(value));
  return (
    <form className="admin-card" onSubmit={(e) => void save(e)}>
      <table className="admin-usage limits-table">
        <thead>
          <tr>
            <th scope="col">Limit per account</th>
            <th scope="col">Saves</th>
            <th scope="col">Default</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.key}>
              <th scope="row">
                {row.label}
                <small>{row.help}</small>
              </th>
              <td>
                <input
                  type="number"
                  min={0}
                  step={1}
                  aria-label={row.label}
                  value={Number.isNaN(draft[row.key]) ? "" : draft[row.key]}
                  onChange={(e) => setDraft({ ...draft, [row.key]: number(e.target.value) })}
                />
              </td>
              <td className="limits-default">{view.defaults[row.key].toLocaleString("en")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="admin-actions">
        <button
          className="button primary"
          disabled={JSON.stringify(draft) === JSON.stringify(view.limits)}
        >
          Save write limits
        </button>
        <button
          type="button"
          className="button"
          disabled={JSON.stringify(draft) === JSON.stringify(view.defaults)}
          onClick={() => {
            setDraft(view.defaults);
            setStatus("Defaults filled in. Save to use them.");
          }}
        >
          Reset to defaults
        </button>
        {status && (
          <span className="admin-status" role="status">
            {status}
          </span>
        )}
      </div>
    </form>
  );
}
