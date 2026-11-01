import { z } from "zod";

const language = z.string().trim().min(1).max(60);
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
