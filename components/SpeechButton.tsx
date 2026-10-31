"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Square, Volume2 } from "lucide-react";
import { pronunciationText, SPEECH_TIMEOUT_MS } from "../lib/speech";

let activePlayback: AbortController | undefined;

export default function SpeechButton({
  text,
  language,
  label,
  demo = false,
  previewEndpoint,
}: {
  text: string;
  language: string;
  label?: string;
  demo?: boolean;
  previewEndpoint?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [error, setError] = useState("");
  const current = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(false);
  const spoken = pronunciationText(text);
  const accessibleLabel = label || `Play ${spoken} in ${language}`;
  useEffect(() => {
    mounted.current = true;
    setState("idle");
    setError("");
    return () => {
      mounted.current = false;
      current.current?.abort();
    };
  }, [spoken, language, previewEndpoint]);

  async function play() {
    if (state === "playing") {
      current.current?.abort();
      return;
    }
    if (demo && !previewEndpoint) {
      setError("Audio needs a configured Requesty server.");
      return;
    }
    activePlayback?.abort();
    const controller = new AbortController();
    current.current = controller;
    activePlayback = controller;
    let url: string | undefined;
    let player: HTMLAudioElement | undefined;
    let finished = false;
    const timer = setTimeout(() => {
      if (!controller.signal.aborted) setError("Audio unavailable. Try again.");
      controller.abort();
    }, SPEECH_TIMEOUT_MS + 3_000);
    const stop = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (player) {
        player.onended = null;
        player.onerror = null;
        player.pause();
        player.removeAttribute("src");
        player.load();
      }
      if (url) {
        URL.revokeObjectURL(url);
        url = undefined;
      }
      if (activePlayback === controller) activePlayback = undefined;
      if (current.current === controller && mounted.current) setState("idle");
    };
    controller.signal.addEventListener("abort", stop, { once: true });
    setError("");
    setState("loading");
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (previewEndpoint) {
        const session = await fetch(`${previewEndpoint}/session`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!session.ok) throw new Error("Unavailable");
        const proof = await session.json();
        if (typeof proof.token !== "string") throw new Error("Unavailable");
        headers["X-Preview-Session"] = proof.token;
      }
      const response = await fetch(previewEndpoint ? `${previewEndpoint}/speech` : "/api/speech", {
        method: "POST",
        headers,
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({ text: spoken, language }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "Audio limit reached. Try again soon."
            : "Audio unavailable. Try again.",
        );
      if (!response.headers.get("content-type")?.startsWith("audio/"))
        throw new Error("Audio unavailable. Try again.");
      const blob = await response.blob();
      if (!blob.size || blob.size > 4_000_000) throw new Error("Audio unavailable. Try again.");
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(blob);
      player = new Audio(url);
      player.onended = () => {
        stop();
      };
      player.onerror = () => {
        if (!controller.signal.aborted) setError("Audio unavailable. Try again.");
        stop();
      };
      await player.play();
      if (!controller.signal.aborted && !finished) setState("playing");
      clearTimeout(timer);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error && failure.message.startsWith("Audio ")
            ? failure.message
            : "Audio unavailable. Try again.",
        );
      stop();
    }
  }
  return (
    <span className="speech-control">
      <button
        type="button"
        className="speech-button"
        onClick={() => void play()}
        disabled={state === "loading" || !spoken}
        aria-label={state === "playing" ? `Stop: ${accessibleLabel}` : accessibleLabel}
        aria-pressed={state === "playing"}
        aria-busy={state === "loading"}
        title={`${state === "playing" ? "Stop audio" : accessibleLabel} · Demo voice, best for English`}
      >
        {state === "loading" ? (
          <LoaderCircle size={16} aria-hidden="true" />
        ) : state === "playing" ? (
          <Square size={14} aria-hidden="true" />
        ) : (
          <Volume2 size={16} aria-hidden="true" />
        )}
      </button>
      {error && (
        <small className="speech-error" role="status">
          {error}
        </small>
      )}
    </span>
  );
}
