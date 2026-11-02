"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { REPORT_REASON_LABELS, type ReportReason } from "../../lib/reports";
import { adminRequest } from "./request";

type Report = {
  id: string;
  created_at: string;
  activity_at: string;
  kind: "speech" | "note";
  reason: ReportReason;
  word: string;
  language: string;
  model: string;
  voice: string | null;
  tier: "basic" | "plus";
  prompt: Record<string, unknown>;
};
type Cluster = {
  kind: Report["kind"];
  language: string;
  model: string;
  voice: string;
  reports: number;
  last: string;
};
type View = {
  reports: Report[];
  summary: Cluster[];
  total: number;
  prunable: number;
  retentionDays: number;
  pageSize: number;
};

const KIND = { speech: "Audio", note: "Language note" } as const;
const when = (value: string) => new Date(value).toLocaleString();

export default function Reports() {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const latest = useRef(0);

  const load = useCallback(async (offset: number, append: boolean) => {
    const id = ++latest.current;
    setBusy(true);
    setError("");
    try {
      const next = await adminRequest<View>(`/api/admin/reports?offset=${offset}`);
      if (id !== latest.current) return;
      setView((current) =>
        append && current ? { ...next, reports: [...current.reports, ...next.reports] } : next,
      );
    } catch (e) {
      if (id === latest.current) setError((e as Error).message);
    } finally {
      if (id === latest.current) setBusy(false);
    }
  }, []);

  // The first page; later pages and reloads go through `load` from the buttons.
  useEffect(() => {
    const id = ++latest.current;
    adminRequest<View>("/api/admin/reports?offset=0")
      .then((next) => {
        if (id === latest.current) setView(next);
      })
      .catch((e: Error) => {
        if (id === latest.current) setError(e.message);
      });
  }, []);

  if (!view) return error ? <p className="error">{error}</p> : <p>Loading reports…</p>;

  async function prune(count: number, days: number) {
    if (
      !window.confirm(
        `Permanently delete ${count.toLocaleString("en")} reports older than ${days} days?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await adminRequest<{ deleted: number }>("/api/admin/reports", "DELETE", {
        olderThanDays: days,
      });
      setStatus(`Deleted ${result.deleted.toLocaleString("en")} reports.`);
      await load(0, false);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const shown = view.reports.length;
  return (
    <>
      <div className="admin-stats">
        <div>
          <span>Reports</span>
          <strong>{view.total.toLocaleString("en")}</strong>
        </div>
        <div>
          <span>Older than {view.retentionDays} days</span>
          <strong>{view.prunable.toLocaleString("en")}</strong>
        </div>
      </div>
      <div className="admin-actions">
        <button
          className="button danger"
          disabled={!view.prunable || busy}
          onClick={() => void prune(view.prunable, view.retentionDays)}
        >
          Delete reports older than {view.retentionDays} days ({view.prunable.toLocaleString("en")})
        </button>
      </div>
      {status && (
        <p className="admin-status" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {view.summary.length > 0 && (
        <section className="admin-card">
          <h2>Where reports cluster</h2>
          <div className="report-scroll">
            <table className="admin-usage">
              <thead>
                <tr>
                  <th scope="col">Result</th>
                  <th scope="col">Language</th>
                  <th scope="col">Model</th>
                  <th scope="col">Voice</th>
                  <th scope="col">Reports</th>
                  <th scope="col">Last</th>
                </tr>
              </thead>
              <tbody>
                {view.summary.map((cluster) => (
                  <tr
                    key={`${cluster.kind}\n${cluster.language}\n${cluster.model}\n${cluster.voice}`}
                  >
                    <td>{KIND[cluster.kind]}</td>
                    <td>{cluster.language}</td>
                    <td>{cluster.model}</td>
                    <td>{cluster.voice || "–"}</td>
                    <td>{cluster.reports.toLocaleString("en")}</td>
                    <td>{when(cluster.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="report-list">
        {view.reports.map((report) => (
          <article className="admin-card report-card" key={report.id}>
            <h2>
              {KIND[report.kind]} · {report.word}
            </h2>
            <p>
              <strong>{REPORT_REASON_LABELS[report.reason]}</strong> · {report.language} ·{" "}
              {report.model}
              {report.voice ? ` · ${report.voice}` : ""} · {report.tier}
            </p>
            <p className="admin-status">
              Reported {when(report.created_at)} · result from {when(report.activity_at)}
            </p>
            <details className="report-request">
              <summary>Request sent, as the learner’s browser recorded it</summary>
              <pre>{JSON.stringify(report.prompt, null, 2)}</pre>
            </details>
          </article>
        ))}
        {!shown && !busy && <p>No reports yet.</p>}
        {busy && <p>Loading…</p>}
        {shown < view.total && !busy && (
          <button className="button" onClick={() => void load(shown, true)}>
            Load more reports
          </button>
        )}
      </div>
    </>
  );
}
