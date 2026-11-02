"use client";
import { useEffect, useState } from "react";
import {
  boundedComment,
  FEEDBACK_TIMEOUT_MS,
  shouldRequestFeedback,
  type FeedbackInput,
} from "../lib/feedback";
import type { Direction } from "../lib/learning";
import { useAiActionLog } from "./AiActionLog";

type Note = { status: "loading" | "ready" | "unavailable"; text: string };
// `input` decides here whether a note is needed at all; the request itself names the stored
// word and sends only the typed answer, and the server rebuilds the rest from the word (#82).
type Props = { input: FeedbackInput; wordId: string; direction: Direction; skipped: boolean };

// A different exercise or answer remounts the note, so it starts loading afresh.
export default function LanguageNote(props: Props) {
  return (
    <NoteRequest
      key={JSON.stringify([props.skipped, props.wordId, props.direction, props.input])}
      {...props}
    />
  );
}

function NoteRequest({ input, wordId, direction, skipped }: Props) {
  const { record } = useAiActionLog();
  const [note, setNote] = useState<Note>({
    status: "loading",
    text: "Preparing a short language note…",
  });
  const { answer, requireAccents, caseSensitive } = input;
  const needsFeedback = !skipped && shouldRequestFeedback(input);
  useEffect(() => {
    if (!needsFeedback) return;
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), FEEDBACK_TIMEOUT_MS + 3_000);
    void (async () => {
      try {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          cache: "no-store",
          credentials: "same-origin",
          body: JSON.stringify({ wordId, direction, answer, requireAccents, caseSensitive }),
        });
        const result = await response.json();
        record(result.action);
        if (!response.ok) throw new Error("Unavailable");
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
  }, [needsFeedback, wordId, direction, answer, requireAccents, caseSensitive, record]);
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
