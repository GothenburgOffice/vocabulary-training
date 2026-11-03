"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { LoaderCircle, Square, Volume2 } from "lucide-react";
import { newAiActionId, readSpeechMeta } from "../lib/ai-actions";
import type { SpeechPart } from "../lib/ai-words";
import { pronunciationText, SPEECH_TIMEOUT_MS } from "../lib/speech";
import { useAiActionLog } from "./AiActionLog";
import { AiFeaturesContext } from "./AiFeatures";

// The clip playing now, anywhere on the page: a newly arriving clip stops it.
let playing: AbortController | undefined;

// The server reads the stored word (#82): the button names it and which of its texts to read.
// `text` and `language` are for the button's label and whether speech is on for it.
type Props = { wordId: string; part: SpeechPart; text: string; language: string; label?: string };

// A new phrase or language remounts the button, so no state or playback carries over.
export default function SpeechButton(props: Props) {
  return <SpeechControl key={`${props.language}\n${pronunciationText(props.text)}`} {...props} />;
}

function SpeechControl({ wordId, part, text, language, label }: Props) {
  const ai = useContext(AiFeaturesContext);
  const { record } = useAiActionLog();
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [error, setError] = useState("");
  const current = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(false);
  const spoken = pronunciationText(text);
  const accessibleLabel = label || `Play ${spoken} in ${language}`;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current?.abort();
    };
  }, []);

  async function play() {
    if (state === "playing") {
      current.current?.abort();
      return;
    }
    // A clip still loading elsewhere isn't cancelled: the server answers "busy" to this click and
    // the first clip plays when it arrives.
    const controller = new AbortController();
    current.current = controller;
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
      if (playing === controller) playing = undefined;
      if (current.current === controller && mounted.current) setState("idle");
    };
    controller.signal.addEventListener("abort", stop, { once: true });
    setError("");
    setState("loading");
    try {
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({ wordId, part }),
      });
      if (!response.ok) {
        const status =
          response.status === 429 ? (await response.json().catch(() => ({}))).status : "";
        throw new Error(
          status === "busy"
            ? "Audio request already in progress. Try again soon."
            : status === "limited"
              ? "Audio limit reached. Try again soon."
              : "Audio unavailable. Try again.",
        );
      }
      if (!response.headers.get("content-type")?.startsWith("audio/"))
        throw new Error("Audio unavailable. Try again.");
      // Only a clip the provider was actually asked for is logged; a cached replay is not a call.
      const meta = readSpeechMeta(response.headers);
      if (meta && response.headers.get("X-Audio-Cache") === "miss")
        record({
          id: newAiActionId(),
          kind: "speech",
          at: new Date().toISOString(),
          wordId,
          word: spoken,
          language,
          model: meta.model,
          voice: meta.voice,
          prompt: { part },
        });
      const blob = await response.blob();
      if (!blob.size || blob.size > 4_000_000) throw new Error("Audio unavailable. Try again.");
      if (controller.signal.aborted) return;
      playing?.abort();
      playing = controller;
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
  // No speech model for this language (or no key): no button at all.
  if (!ai.speech.includes(language)) return null;
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
        title={state === "playing" ? "Stop audio" : accessibleLabel}
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
