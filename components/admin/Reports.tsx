"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { REPORT_REASON_LABELS, type ReportReason } from "../../lib/reports";
import { adminRequest } from "./request";

type Report = {
  id: string;
  // Dates only (YYYY-MM-DD): reports keep no times, so they can't be matched to an account.
  reported_on: string;
  activity_on: string;
  kind: "speech" | "note";
  reason: ReportReason;
  word: string;
  language: string;
  model: string;
  voice: string | null;
  tier: "basic" | "plus";
  prompt: Record<string, unknown>;
};
type Page = {
  reports: Report[];
  total: number;
  prunable: number;
  retentionDays: number;
  pageSize: number;
};
// The pages loaded so far, and whether the last one was full (so another may follow).
type View = Page & { more: boolean };

const KIND = { speech: "Audio", note: "Language note" } as const;

// The query for the page after `last`, or the first page.
const pageUrl = (last?: Report) =>
  last
    ? `/api/admin/reports?${new URLSearchParams({ beforeOn: last.reported_on, beforeId: last.id })}`
    : "/api/admin/reports";
const toView = (page: Page, earlier: Report[] = []): View => ({
  ...page,
  reports: [...earlier, ...page.reports],
  more: page.reports.length === page.pageSize,
});

// Reports, newest first, a page at a time. No grouping or analysis yet (owner, #95).
export default function Reports() {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const latest = useRef(0);

  // `after` continues from the reports shown; without it the list starts again from the top.
  const load = useCallback(async (after?: Report[]) => {
    const id = ++latest.current;
    setBusy(true);
    setError("");
    try {
      const page = await adminRequest<Page>(pageUrl(after?.at(-1)));
      if (id === latest.current) setView(toView(page, after));
    } catch (e) {
      if (id === latest.current) setError((e as Error).message);
    } finally {
      if (id === latest.current) setBusy(false);
    }
  }, []);

  // The first page. Calling `load` here would set state synchronously inside the effect,
  // which the React lint rules refuse, so this sets it only when the answer arrives.
  useEffect(() => {
    const id = ++latest.current;
    adminRequest<Page>(pageUrl())
      .then((page) => {
        if (id === latest.current) setView(toView(page));
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
      await load();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

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
              Reported {report.reported_on} · result from {report.activity_on}
            </p>
            <details className="report-request">
              <summary>Request sent, as the learner’s browser recorded it</summary>
              <pre>{JSON.stringify(report.prompt, null, 2)}</pre>
            </details>
          </article>
        ))}
        {!view.reports.length && !busy && <p>No reports yet.</p>}
        {busy && <p>Loading…</p>}
        {view.more && !busy && (
          <button className="button" onClick={() => void load(view.reports)}>
            Load more reports
          </button>
        )}
      </div>
    </>
  );
}
