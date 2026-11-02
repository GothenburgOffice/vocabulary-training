import { z } from "zod";

const language = z.string().trim().min(1).max(60);
// POST /api/feedback: which stored word, in which direction, and the learner's typed answer:
// the only free text (#82). The server builds the note's input from the stored word.
export const feedbackRequestSchema = z
  .object({
    wordId: z.string().uuid(),
    direction: z.enum(["forward", "reverse"]),
    answer: z.string().trim().min(1).max(500),
    requireAccents: z.boolean(),
    caseSensitive: z.boolean(),
  })
  .strict();
// The note's input, as built on the server.
export const feedbackSchema = z
  .object({
    sourceLanguage: language,
    targetLanguage: language,
    explanationLanguage: language,
    source: z.string().trim().min(1).max(200),
    reference: z.string().trim().min(1).max(200),
    accepted: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
    answer: z.string().trim().min(1).max(500),
    correct: z.boolean(),
    requireAccents: z.boolean(),
    caseSensitive: z.boolean(),
  })
  .strict()
  .refine((value) => value.sourceLanguage !== value.targetLanguage);
