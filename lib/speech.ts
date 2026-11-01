export const SPEECH_TIMEOUT_MS = 30_000;
export type SpeechInput = { text: string; language: string };

export function pronunciationText(value: string): string {
  return value.trim().normalize("NFC");
}
