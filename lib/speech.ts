export const SPEECH_TIMEOUT_MS = 30_000;
export type SpeechInput = { text: string; language: string };

// Speak the same first accepted alternative displayed as the question.
export function pronunciationText(value: string): string {
  return value.split("|")[0].trim().normalize("NFC");
}
