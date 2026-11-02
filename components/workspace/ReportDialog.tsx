import { useEffect, useState, type FormEvent } from "react";
import { REPORT_REASONS, type Activity } from "../../lib/reports";

export default function ReportDialog() {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [activityId, setActivityId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/reports", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load recent activity.");
        setActivities(result.activities);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityId, reason }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Could not send this report. Please retry.");
      }
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <p role="status">Report sent. Thank you for helping improve the service.</p>;
  return (
    <>
      <p>
        Pick a speech or language-note action from the last hour, then choose what went wrong.
        Reports go to the site admin, not an AI provider. No audio is stored.
      </p>
      {activities === null && !error && <p role="status">Loading recent activity…</p>}
      {activities?.length === 0 && (
        <p>No recent activity. Play a word or request a language note, then return here.</p>
      )}
      {!!activities?.length && (
        <form onSubmit={(event) => void submit(event)}>
          <label className="field">
            Recent activity
            <select
              required
              value={activityId}
              disabled={busy}
              onChange={(event) => {
                setActivityId(event.target.value);
                setReason("");
              }}
            >
              <option value="">Choose an action…</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {new Date(activity.createdAt).toLocaleTimeString()} ·{" "}
                  {activity.kind === "speech" ? "Speech" : "Language note"} · {activity.word} ·{" "}
                  {activity.language} · {activity.model}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            What went wrong?
            <select
              required
              value={reason}
              disabled={busy || !activityId}
              onChange={(event) => setReason(event.target.value)}
            >
              <option value="">Choose a reason…</option>
              {Object.entries(REPORT_REASONS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="dialog-actions">
            <button className="button primary" disabled={busy || !activityId || !reason}>
              {busy ? "Sending…" : "Send report"}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
