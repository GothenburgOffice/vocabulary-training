// What the AI calls are about, built from a word stored in the account's lists (#82): the
// client only names the word, so no text from the browser goes into a prompt except the
// learner's typed answer.
import type { FeedbackInput } from "./feedback";
import { isCorrect, type Direction } from "./learning";
import type { SpeechInput } from "./speech";

export type AiWord = {
  native: string;
  baseLanguage: string;
  learningLanguage: string;
  // Accepted answers in the learning language, the primary one first.
  answers: string[];
};
// Which text of the word to read: its native side, its primary answer, or every answer.
export const SPEECH_PARTS = ["native", "learning", "answers"] as const;
export type SpeechPart = (typeof SPEECH_PARTS)[number];
// The longest text read at once; further answers that don't fit are left out.
export const MAX_SPEECH_TEXT = 1000;

export function speechText(word: AiWord, part: SpeechPart): SpeechInput {
  if (part === "native") return { text: word.native, language: word.baseLanguage };
  if (part === "learning") return { text: word.answers[0], language: word.learningLanguage };
  // Semicolons make every speech model read them as separate words, not one sentence (#79).
  let text = word.answers[0];
  for (const answer of word.answers.slice(1)) {
    if (text.length + 2 + answer.length > MAX_SPEECH_TEXT) break;
    text += `; ${answer}`;
  }
  return { text, language: word.learningLanguage };
}

export type NoteRequest = {
  direction: Direction;
  answer: string;
  requireAccents: boolean;
  caseSensitive: boolean;
};
// The language note's input. The grade is worked out here, with the same deterministic match
// as practice, never taken from the client.
export function noteInput(word: AiWord, request: NoteRequest): FeedbackInput {
  const forward = request.direction === "forward";
  const [primary, ...further] = word.answers;
  const input = {
    sourceLanguage: forward ? word.baseLanguage : word.learningLanguage,
    targetLanguage: forward ? word.learningLanguage : word.baseLanguage,
    explanationLanguage: word.baseLanguage,
    source: forward ? word.native : primary,
    reference: forward ? primary : word.native,
    ...(forward && further.length ? { accepted: further } : {}),
    answer: request.answer,
    requireAccents: request.requireAccents,
    caseSensitive: request.caseSensitive,
  };
  return {
    ...input,
    correct: isCorrect(
      request.answer,
      [input.reference, ...(input.accepted ?? [])],
      request.caseSensitive,
      request.requireAccents,
    ),
  };
}

// What a call costs against the letter budgets: the letters of everything sent about the word.
export const letterCount = (...texts: string[]) =>
  texts.reduce((sum, text) => sum + Array.from(text).length, 0);
