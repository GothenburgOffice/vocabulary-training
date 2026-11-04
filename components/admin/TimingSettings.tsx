"use client";
import { useEffect, useState, type FormEvent } from "react";
import {
  INPUT_LABELS,
  INPUT_TYPES,
  MIN_SAMPLES,
  shareAtOrAbove,
  type TimingSettings as Settings,
} from "../../lib/timing";
import { adminRequest } from "./request";

type Summary = Record<
  (typeof INPUT_TYPES)[number],
  { answers: number; accounts: number; buckets: [number, number][] }
>;
type View = { settings: Settings; defaults: Settings; summary: Summary };
// The thresholds the calibration table shows, besides the one set.
const THRESHOLDS = [1, 1.5, 2, 2.5, 3, 4];
const percent = (share: number) => `${(share * 100).toFixed(1)}%`;

// Answer timing (#2): the pause cutoff per input type and the Hard threshold, with what
// share of scored answers each threshold would mark Hard. Collect only: nothing is graded.
export default function TimingSettings() {
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  function show(v: View) {
    setView(v);
    setDraft(v.settings);
  }
  useEffect(() => {
    adminRequest<View>("/api/admin/timing")
      .then(show)
      .catch((e: Error) => setError(e.message));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setStatus("Saving…");
    try {
      show(await adminRequest<View>("/api/admin/timing", "PUT", draft));
      setStatus("Saved.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  if (!view || !draft) return error ? <p className="error">{error}</p> : <p>Loading…</p>;
  const changed = JSON.stringify(draft) !== JSON.stringify(view.settings);
  const number = (value: string) => (value.trim() === "" ? NaN : Number(value));
  const thresholds = [...new Set([...THRESHOLDS, view.settings.hardThreshold])].sort(
    (a, b) => a - b,
  );
  return (
    <>
      <form className="admin-card" onSubmit={(e) => void save(e)}>
        <table className="admin-usage limits-table">
          <thead>
            <tr>
              <th scope="col">Setting</th>
              {INPUT_TYPES.map((input) => (
                <th key={input} scope="col">
                  {INPUT_LABELS[input]}
                </th>
              ))}
              <th scope="col">Default</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                Pause cutoff (ms)
                <small>
                  Of each pause between keystrokes, and before the check, only the part longer than
                  this counts as hesitation. The time before the first keystroke always counts.
                </small>
              </th>
              {INPUT_TYPES.map((input) => (
                <td key={input}>
                  <input
                    type="number"
                    min={200}
                    max={10000}
                    step={50}
                    aria-label={`${INPUT_LABELS[input]}: pause cutoff (ms)`}
                    value={Number.isNaN(draft.cutoffMs[input]) ? "" : draft.cutoffMs[input]}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        cutoffMs: { ...draft.cutoffMs, [input]: number(e.target.value) },
                      })
                    }
                  />
                </td>
              ))}
              <td className="limits-default">
                {INPUT_TYPES.map((input) => view.defaults.cutoffMs[input]).join(" / ")}
              </td>
            </tr>
            <tr>
              <th scope="row">
                Hard threshold
                <small>
                  How many standard deviations above the learner&apos;s own usual hesitation an
                  answer would need to count as Hard. Not applied yet.
                </small>
              </th>
              <td>
                <input
                  type="number"
                  min={0.5}
                  max={5}
                  step={0.25}
                  aria-label="Hard threshold"
                  value={Number.isNaN(draft.hardThreshold) ? "" : draft.hardThreshold}
                  onChange={(e) => setDraft({ ...draft, hardThreshold: number(e.target.value) })}
                />
              </td>
              <td />
              <td className="limits-default">{view.defaults.hardThreshold}</td>
            </tr>
          </tbody>
        </table>
        <div className="admin-actions">
          <button className="button primary" disabled={!changed}>
            Save timing settings
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
      <section className="admin-card">
        <h2>Calibration</h2>
        <p>
          Right, typed answers measured on this site, and the share of scored answers each threshold
          would mark Hard. An answer is scored once its account has {MIN_SAMPLES} answers on that
          input type to compare with. No account is shown or stored here.
        </p>
        <table className="admin-usage">
          <thead>
            <tr>
              <th scope="col">Input type</th>
              <th scope="col">Answers</th>
              <th scope="col">Accounts with a usual</th>
              <th scope="col">Scored</th>
              {thresholds.map((t) => (
                <th key={t} scope="col">
                  {t === view.settings.hardThreshold ? <strong>≥ {t} (set)</strong> : `≥ ${t}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INPUT_TYPES.map((input) => {
              const s = view.summary[input];
              const buckets = new Map(s.buckets);
              const scored = s.buckets.reduce((n, [, count]) => n + count, 0);
              return (
                <tr key={input}>
                  <th scope="row">{INPUT_LABELS[input]}</th>
                  <td>{s.answers.toLocaleString("en")}</td>
                  <td>{s.accounts.toLocaleString("en")}</td>
                  <td>{scored.toLocaleString("en")}</td>
                  {thresholds.map((t) => (
                    <td key={t}>{scored ? percent(shareAtOrAbove(buckets, t)) : "–"}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
