import { useState, type FormEvent } from "react";
import type { AiAction } from "../../lib/ai-actions";
import {
  REASONS_FOR_KIND,
  REPORT_REASON_LABELS,
  reportFromAction,
  type ReportReason,
} from "../../lib/reports";
import Button from "./Button";

const KIND_LABEL = { speech: "Audio", note: "Language note" } as const;

// Reports one of the learner's recent AI results. The result is taken from the browser's log;
// nothing is sent to an AI provider (#95).
export default function ReportDialog({
  actions,
  onClose,
}: {
  // Newest first.
  actions: AiAction[];
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState(actions[0]?.id ?? "");
  const [reason, setReason] = useState<ReportReason | "">("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const action = actions.find((candidate) => candidate.id === chosen) ?? actions[0];
  if (!action) return <p>There is no AI result to report yet.</p>;
  const reasons = REASONS_FOR_KIND[action.kind];
  // A reason picked for another result is dropped when it doesn't apply to this one.
  const selectedReason = reason && reasons.includes(reason) ? reason : "";

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!action || !selectedReason || state === "sending") return;
    setState("sending");
    setError("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(reportFromAction(action, selectedReason)),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The report could not be sent. Try again.");
      setState("sent");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The report could not be sent.");
      setState("error");
    }
  }

  if (state === "sent")
    return (
      <>
        <p role="status">Thank you. The site’s administrators will look at this result.</p>
        <div className="inline-actions">
          <Button onClick={onClose}>Close</Button>
        </div>
      </>
    );

  return (
    <form onSubmit={(event) => void send(event)}>
      <label className="field">
        AI result
        <select
          value={action.id}
          disabled={state === "sending"}
          onChange={(event) => {
            setChosen(event.target.value);
            setState("idle");
          }}
        >
          {actions.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {KIND_LABEL[candidate.kind]} · {candidate.word} ·{" "}
              {new Date(candidate.at).toLocaleTimeString()}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        What is wrong?
        <select
          value={selectedReason}
          disabled={state === "sending"}
          onChange={(event) => setReason(event.target.value as ReportReason)}
        >
          <option value="">Choose a reason…</option>
          {reasons.map((value) => (
            <option key={value} value={value}>
              {REPORT_REASON_LABELS[value]}
            </option>
          ))}
        </select>
      </label>
      <p className="field-help">
        The report keeps the word, the language, the model and the request that was sent. It is not
        sent to the AI provider.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="inline-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!selectedReason || state === "sending"}>
          Send report
        </Button>
      </div>
    </form>
  );
}
