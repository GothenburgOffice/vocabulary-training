"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReportSort } from "@/lib/admin/reports";
import type { Sort } from "@/lib/admin/sort";
import { REPORT_KIND_LABELS as KIND, REPORT_REASON_LABELS, type ReportReason } from "@/lib/reports";
import Dialog from "@/components/workspace/Dialog";
import { adminRequest } from "./request";
import SortHeader from "./SortHeader";

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

const NEWEST: Sort<ReportSort> = { key: "reported", dir: "desc" };

// The first page in an order, or the page after the last report shown.
const pageUrl = (sort: Sort<ReportSort>, last?: Report) =>
  `/api/admin/reports?${new URLSearchParams({ sort: sort.key, dir: sort.dir, ...(last ? { after: last.id } : {}) })}`;

// Reported AI results: a read-only table, newest first or sorted by any heading (on the
// server, as the list loads in pages). A row opens the report with the request that was sent.
// No grouping or analysis yet (owner, #95).
export default function Reports() {
  const [view, setView] = useState<View | null>(null);
  const [sort, setSort] = useState(NEWEST);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const latest = useRef(0);

  // `after` continues from the reports shown; without it the list starts again from the top.
  const load = useCallback(async (order: Sort<ReportSort>, after: Report[] = []) => {
    const id = ++latest.current;
    setBusy(true);
    setError("");
    try {
      const page = await adminRequest<Page>(pageUrl(order, after.at(-1)));
      if (id === latest.current)
        setView({
          ...page,
          reports: [...after, ...page.reports],
          more: page.reports.length === page.pageSize,
        });
    } catch (e) {
      if (id === latest.current) setError((e as Error).message);
    } finally {
      if (id === latest.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    // Deferred, so the effect doesn't set state synchronously (the React lint rules).
    const timer = window.setTimeout(() => void load(sort), 0);
    return () => window.clearTimeout(timer);
  }, [sort, load]);

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
      await load(sort);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const opened = view.reports.find((report) => report.id === openId) ?? null;
  const heading = (label: string, key: ReportSort, firstDir: "asc" | "desc" = "asc") => (
    <SortHeader label={label} sortKey={key} sort={sort} onSort={setSort} firstDir={firstDir} />
  );

  return (
    <>
      <div className="reports-toolbar">
        <p>
          <strong>{view.total.toLocaleString("en")}</strong> reports, of which{" "}
          <strong>{view.prunable.toLocaleString("en")}</strong> are older than {view.retentionDays}{" "}
          days.
        </p>
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
      <p className="field-help">
        Showing {view.reports.length.toLocaleString("en")} of {view.total.toLocaleString("en")}.
        Click a heading to sort, and a report to see the request that was sent.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table clickable-rows reports-table">
          <thead>
            <tr>
              <SortHeader
                className="row-head"
                label="Reported"
                sortKey="reported"
                sort={sort}
                onSort={setSort}
                firstDir="desc"
              />
              {heading("Result from", "activity", "desc")}
              {heading("Type", "kind")}
              {heading("Reason", "reason")}
              {heading("Word", "word")}
              {heading("Language", "language")}
              {heading("Model", "model")}
              {heading("Voice", "voice")}
              {heading("Tier", "tier")}
            </tr>
          </thead>
          <tbody>
            {view.reports.map((report) => (
              <tr key={report.id} onClick={() => setOpenId(report.id)}>
                <th scope="row" className="row-head">
                  {/* The row opens on a click anywhere; the button is the keyboard's way in. */}
                  <button
                    type="button"
                    className="row-open"
                    aria-haspopup="dialog"
                    aria-label={`Report of ${report.word}, ${report.reported_on}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenId(report.id);
                    }}
                  >
                    {report.reported_on}
                  </button>
                </th>
                <td className="cell">{report.activity_on}</td>
                <td className="cell">{KIND[report.kind]}</td>
                <td className="cell">{REPORT_REASON_LABELS[report.reason]}</td>
                <td className="cell report-word" title={report.word}>
                  {report.word}
                </td>
                <td className="cell">{report.language}</td>
                <td className="cell report-model" title={report.model}>
                  {report.model}
                </td>
                <td className="cell">{report.voice ?? "–"}</td>
                <td className="cell">{report.tier === "plus" ? "Plus" : "Basic"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!view.reports.length && !busy && <p>No reports yet.</p>}
      {busy && <p>Loading…</p>}
      {view.more && !busy && (
        <button className="button admin-more" onClick={() => void load(sort, view.reports)}>
          Load more reports
        </button>
      )}
      <Dialog
        title={opened ? `${KIND[opened.kind]} · ${opened.word}` : null}
        onClose={() => setOpenId(null)}
      >
        {opened && <ReportCard report={opened} />}
      </Dialog>
    </>
  );
}

// One report in full. No account is shown or kept with it.
function ReportCard({ report }: { report: Report }) {
  return (
    <div className="detail-card">
      <section>
        <dl className="detail-facts">
          <dt>Reason</dt>
          <dd>{REPORT_REASON_LABELS[report.reason]}</dd>
          <dt>Reported</dt>
          <dd>{report.reported_on}</dd>
          <dt>Result from</dt>
          <dd>{report.activity_on}</dd>
          <dt>Language</dt>
          <dd>{report.language}</dd>
          <dt>Model</dt>
          <dd>{report.model}</dd>
          {report.voice && (
            <>
              <dt>Voice</dt>
              <dd>{report.voice}</dd>
            </>
          )}
          <dt>Tier</dt>
          <dd>{report.tier === "plus" ? "Plus" : "Basic"}</dd>
        </dl>
      </section>
      <section>
        <h3>Request sent, as the learner’s browser recorded it</h3>
        <pre className="report-request">{JSON.stringify(report.prompt, null, 2)}</pre>
      </section>
    </div>
  );
}
