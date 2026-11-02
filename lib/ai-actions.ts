export type AiAction = {
  id: string;
  kind: "speech" | "note";
  model: string;
  wordId: string;
  word: string;
  at: string;
  prompt: Record<string, unknown>;
};

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
    typeof action.model === "string" &&
    typeof action.wordId === "string" &&
    typeof action.word === "string" &&
    typeof action.at === "string" &&
    !!action.prompt &&
    typeof action.prompt === "object" &&
    !Array.isArray(action.prompt)
  );
}

export function decodeAiAction(value: string | null): AiAction | undefined {
  if (!value) return undefined;
  try {
    const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
    const action: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isAiAction(action) ? action : undefined;
  } catch {
    return undefined;
  }
}
