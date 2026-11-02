"use client";
import { useEffect, useState } from "react";
import { REPORT_REASONS, type IssueReport } from "../../lib/reports";
import { adminRequest } from "./request";

export default function ReportsPanel() {
  const [reports, setReports] = useState<IssueReport[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    adminRequest<{ reports: IssueReport[] }>("/api/admin/reports")
      .then((result) => setReports(result.reports))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function prune() {
    if (!window.confirm("Delete reports older than 15 days? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const { deleted } = await adminRequest<{ deleted: number }>("/api/admin/reports", "DELETE");
      const result = await adminRequest<{ reports: IssueReport[] }>("/api/admin/reports");
      setReports(result.reports);
      setStatus(`Deleted ${deleted} report${deleted === 1 ? "" : "s"} older than 15 days.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-card">
      <div className="admin-actions">
        <button className="button" disabled={busy} onClick={() => void prune()}>
          {busy ? "Pruning…" : "Prune reports older than 15 days"}
        </button>
        {status && <span role="status">{status}</span>}
      </div>
      <p>
        Newest 200 reports. Pruning permanently removes older reports, not learners’ word lists.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {reports === null && !error && <p>Loading reports…</p>}
      {reports?.length === 0 && <p>No reports yet.</p>}
      {reports?.map((report) => (
        <article className="admin-card" key={report.id}>
          <h2>{REPORT_REASONS[report.reason]}</h2>
          <p>
            <strong>{report.activity.word}</strong> · {report.activity.language} ·{" "}
            {report.activity.kind === "speech" ? "Speech" : "Language note"}
          </p>
          <p>
            Model: {report.activity.model} · Voice: {report.activity.voice || "default"} · Tier:{" "}
            {report.activity.tier}
          </p>
          <p>
            Action: <time>{new Date(report.activity.createdAt).toLocaleString()}</time>
            {" · "}Reported: <time>{new Date(report.createdAt).toLocaleString()}</time>
          </p>
        </article>
      ))}
    </section>
  );
}
