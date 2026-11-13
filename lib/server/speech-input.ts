import { z } from "zod";
import { MAX_SPEECH_TEXT, SPEECH_PARTS } from "@/lib/ai-words";
import type { SpeechInput } from "@/lib/speech";

// POST /api/speech: which stored word to read, and which of its texts (#82). Never the text.
export const speechRequestSchema = z
  .object({ wordId: z.string().uuid(), part: z.enum(SPEECH_PARTS) })
  .strict();
// The text read aloud, built on the server from the stored word.
export const speechSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1)
      .max(MAX_SPEECH_TEXT)
      .refine((value) => !/[\u0000-\u001f\u007f-\u009f]/u.test(value)),
    language: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine((value) => !/[\u0000-\u001f\u007f-\u009f]/u.test(value)),
  })
  .strict() satisfies z.ZodType<SpeechInput>;
