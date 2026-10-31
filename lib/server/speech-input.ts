import { z } from "zod";
import type { SpeechInput } from "../speech";

export const speechSchema = z.object({
  text: z.string().trim().min(1).max(200).refine(value => !/[\u0000-\u001f\u007f-\u009f]/u.test(value)),
  language: z.string().trim().min(1).max(60).refine(value => !/[\u0000-\u001f\u007f-\u009f]/u.test(value)),
}).strict() satisfies z.ZodType<SpeechInput>;
