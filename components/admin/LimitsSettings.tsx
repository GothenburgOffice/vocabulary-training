"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { AiKind, AiLimits, KindLimits } from "@/lib/ai-limits";
import { adminRequest } from "./request";

type View = { limits: AiLimits; defaults: AiLimits };
type Row = {
  label: string;
  help: string;
  get: (k: KindLimits) => number;
  set: (k: KindLimits, value: number) => KindLimits;
};
const ROWS: Row[] = [
  {
    label: "Letters per minute",
    help: "Stops bursts, per account.",
    get: (k) => k.lettersPerMinute,
    set: (k, v) => ({ ...k, lettersPerMinute: v }),
  },
  {
    label: "Letters per day, basic",
    help: "Over the last 24 hours, per basic account.",
    get: (k) => k.lettersPerDay.basic,
    set: (k, v) => ({ ...k, lettersPerDay: { ...k.lettersPerDay, basic: v } }),
  },
  {
    label: "Letters per day, plus",
    help: "Over the last 24 hours, per plus account.",
    get: (k) => k.lettersPerDay.plus,
    set: (k, v) => ({ ...k, lettersPerDay: { ...k.lettersPerDay, plus: v } }),
  },
  {
    label: "Cooldown between calls (ms)",
    help: "The least time between two calls from one account.",
    get: (k) => k.cooldownMs,
    set: (k, v) => ({ ...k, cooldownMs: v }),
  },
];
const KINDS: { kind: AiKind; title: string }[] = [
  { kind: "speech", title: "Speech" },
  { kind: "note", title: "Language notes" },
];

// The AI abuse limits (#82), all at once, with an explicit save like the rest of admin.
export default function LimitsSettings() {
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<AiLimits | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  function show(v: View) {
    setView(v);
    setDraft(v.limits);
  }
  useEffect(() => {
    adminRequest<View>("/api/admin/limits")
      .then(show)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setStatus("Saving…");
    try {
      show(await adminRequest<View>("/api/admin/limits", "PUT", draft));
      setStatus("Saved.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  if (!view || !draft) return error ? <p className="error">{error}</p> : <p>Loading…</p>;
  const changed = JSON.stringify(draft) !== JSON.stringify(view.limits);
  const number = (value: string) => (value.trim() === "" ? NaN : Number(value));
  return (
    <form className="admin-card" onSubmit={(e) => void save(e)}>
      <table className="admin-usage limits-table">
        <thead>
          <tr>
            <th scope="col">Limit per account</th>
            {KINDS.map(({ kind, title }) => (
              <th key={kind} scope="col">
                {title}
              </th>
            ))}
            <th scope="col">Default</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label}>
              <th scope="row">
                {row.label}
                <small>{row.help}</small>
              </th>
              {KINDS.map(({ kind, title }) => (
                <td key={kind}>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    aria-label={`${title}: ${row.label}`}
                    value={Number.isNaN(row.get(draft[kind])) ? "" : row.get(draft[kind])}
                    onChange={(e) =>
                      setDraft({ ...draft, [kind]: row.set(draft[kind], number(e.target.value)) })
                    }
                  />
                </td>
              ))}
              <td className="limits-default">
                {KINDS.map(({ kind }) => row.get(view.defaults[kind]).toLocaleString("en")).join(
                  " / ",
                )}
              </td>
            </tr>
          ))}
          <tr>
            <th scope="row">
              Speech request block (seconds)
              <small>
                One clip loads at a time per account. After this long, a new click may replace a
                clip still loading.
              </small>
            </th>
            <td>
              <input
                type="number"
                min={1}
                max={300}
                step={1}
                aria-label="Speech request block (seconds)"
                value={Number.isNaN(draft.speechBlockMs) ? "" : draft.speechBlockMs / 1000}
                onChange={(e) =>
                  setDraft({ ...draft, speechBlockMs: number(e.target.value) * 1000 })
                }
              />
            </td>
            <td />
            <td className="limits-default">{view.defaults.speechBlockMs / 1000}</td>
          </tr>
        </tbody>
      </table>
      <div className="admin-actions">
        <button className="button primary" disabled={!changed}>
          Save limits
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
