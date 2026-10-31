"use client";
import { useEffect, useState } from "react";
import {
  boundedComment,
  FEEDBACK_TIMEOUT_MS,
  shouldRequestFeedback,
  type FeedbackInput,
} from "../lib/feedback";

type Note = { status: "loading" | "ready" | "unavailable"; text: string };
export default function LanguageNote({
  input,
  demo,
  skipped,
  previewFeedback,
}: {
  input: FeedbackInput;
  demo: boolean;
  skipped: boolean;
  previewFeedback?: { endpoint: string; timeoutMs: number };
}) {
  const [note, setNote] = useState<Note>({
    status: "loading",
    text: "Preparing a short language note…",
  });
  const {
    sourceLanguage,
    targetLanguage,
    explanationLanguage,
    source,
    reference,
    answer,
    correct,
    requireAccents,
    caseSensitive,
  } = input;
  const previewEndpoint = previewFeedback?.endpoint;
  const timeoutMs = previewFeedback?.timeoutMs ?? FEEDBACK_TIMEOUT_MS;
  const needsFeedback = !skipped && shouldRequestFeedback(input);
  useEffect(() => {
    if ((demo && !previewEndpoint) || !needsFeedback) return;
    const controller = new AbortController();
    let active = true;
    setNote({ status: "loading", text: "Preparing a short language note…" });
    const timeout = setTimeout(() => controller.abort(), timeoutMs + 3_000);
    void (async () => {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (previewEndpoint) {
          const session = await fetch(`${previewEndpoint}/session`, {
            signal: controller.signal,
            cache: "no-store",
            credentials: "same-origin",
          });
          if (!session.ok) throw new Error("Preview session unavailable");
          const proof = await session.json();
          if (typeof proof.token !== "string") throw new Error("Invalid preview session");
          headers["X-Preview-Session"] = proof.token;
        }
        const response = await fetch(
          previewEndpoint ? `${previewEndpoint}/feedback` : "/api/feedback",
          {
            method: "POST",
            headers,
            signal: controller.signal,
            cache: "no-store",
            credentials: "same-origin",
            body: JSON.stringify({
              sourceLanguage,
              targetLanguage,
              explanationLanguage,
              source,
              reference,
              answer,
              correct,
              requireAccents,
              caseSensitive,
            }),
          },
        );
        if (!response.ok) throw new Error("Unavailable");
        const result = await response.json();
        if (active)
          setNote(
            result.status === "ready"
              ? { status: "ready", text: boundedComment(result.comment) }
              : {
                  status: "unavailable",
                  text:
                    result.status === "disabled"
                      ? "AI comments are not enabled on this server."
                      : result.status === "limited"
                        ? "AI usage limit reached. Keep practising as usual."
                        : "AI comment unavailable right now.",
                },
          );
      } catch {
        if (active) setNote({ status: "unavailable", text: "AI comment unavailable right now." });
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    demo,
    needsFeedback,
    previewEndpoint,
    timeoutMs,
    sourceLanguage,
    targetLanguage,
    explanationLanguage,
    source,
    reference,
    answer,
    correct,
    requireAccents,
    caseSensitive,
  ]);
  if (!needsFeedback) return null;
  const text = skipped
    ? "No answer to comment on. Try the word again when you are ready."
    : demo && !previewEndpoint
      ? "Live comments appear here when Requesty is configured. This preview has no feedback backend connected."
      : note.text;
  return (
    <aside
      className="language-note"
      aria-label="AI language note"
      aria-busy={(!demo || !!previewEndpoint) && !skipped && note.status === "loading"}
    >
      <h3>
        AI language note{" "}
        {demo && <span>{previewEndpoint ? "Live preview" : "Design preview"}</span>}
      </h3>
      <p role="status">{text}</p>
      <small>Comment only. Your score is unchanged.</small>
    </aside>
  );
}
