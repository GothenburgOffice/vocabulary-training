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
  skipped,
}: {
  input: FeedbackInput;
  skipped: boolean;
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
  const needsFeedback = !skipped && shouldRequestFeedback(input);
  useEffect(() => {
    if (!needsFeedback) return;
    const controller = new AbortController();
    let active = true;
    setNote({ status: "loading", text: "Preparing a short language note…" });
    const timeout = setTimeout(() => controller.abort(), FEEDBACK_TIMEOUT_MS + 3_000);
    void (async () => {
      try {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
        });
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
    needsFeedback,
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
    : note.text;
  return (
    <aside
      className="language-note"
      aria-label="AI language note"
      aria-busy={!skipped && note.status === "loading"}
    >
      <h3>AI language note</h3>
      <p role="status">{text}</p>
      <small>Comment only. Your score is unchanged.</small>
    </aside>
  );
}
