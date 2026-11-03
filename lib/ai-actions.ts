// The learner's recent AI calls, kept in the browser tab only (#95). Nothing here is sent
// anywhere until the learner reports one. Pure: the client and the speech route both import it.

export type AiActionKind = "speech" | "note";

export type AiAction = {
  id: string;
  kind: AiActionKind;
  at: string;
  wordId: string;
  // The text the call was about, and its language.
  word: string;
  language: string;
  model: string;
  voice?: string;
  // What the provider was asked: the chat request for a note, or the speech options for audio.
  prompt: Record<string, unknown>;
};

// Only the newest entries are kept; older ones fall off the front.
export const MAX_AI_ACTIONS = 20;

export function appendAiAction(actions: AiAction[], action: AiAction): AiAction[] {
  return [...actions, action].slice(-MAX_AI_ACTIONS);
}

export function isAiAction(value: unknown): value is AiAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Partial<AiAction>;
  return (
    typeof action.id === "string" &&
    (action.kind === "speech" || action.kind === "note") &&
    typeof action.at === "string" &&
    typeof action.wordId === "string" &&
    typeof action.word === "string" &&
    typeof action.language === "string" &&
    typeof action.model === "string" &&
    (action.voice === undefined || typeof action.voice === "string") &&
    !!action.prompt &&
    typeof action.prompt === "object" &&
    !Array.isArray(action.prompt)
  );
}

export function newAiActionId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Audio is binary, so the speech route sends the model and voice in headers instead of a body.
// Values are URL-encoded so any character survives a header.
export const SPEECH_MODEL_HEADER = "X-AI-Model";
export const SPEECH_VOICE_HEADER = "X-AI-Voice";

export function speechHeaders(settings: { model: string; voice: string }) {
  return {
    [SPEECH_MODEL_HEADER]: encodeURIComponent(settings.model),
    [SPEECH_VOICE_HEADER]: encodeURIComponent(settings.voice),
  };
}

export function readSpeechMeta(headers: Headers): { model: string; voice: string } | undefined {
  const model = headers.get(SPEECH_MODEL_HEADER);
  if (!model) return undefined;
  try {
    return {
      model: decodeURIComponent(model),
      voice: decodeURIComponent(headers.get(SPEECH_VOICE_HEADER) ?? ""),
    };
  } catch {
    return undefined;
  }
}
