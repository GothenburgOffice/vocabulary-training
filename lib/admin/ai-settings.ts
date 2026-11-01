// Shapes shared by the admin pages and app/api/admin/{ai,languages,models}.
import { z } from "zod";

const noControl = (value: string) => !/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value);
const model = z.string().trim().max(200).refine(noControl, "Remove control characters.");
const voice = z.string().trim().max(60).refine(noControl, "Remove control characters.");
const instructions = z.string().trim().max(2000).refine(noControl, "Remove control characters.");

export const tierSchema = z.enum(["basic", "plus"]);
export type Tier = z.infer<typeof tierSchema>;

// apiKey: omitted keeps the stored key, null clears it, a string replaces it.
export const tierUpdateSchema = z
  .object({
    tier: tierSchema,
    model: model.optional(),
    apiKey: z.string().trim().min(1).max(500).refine(noControl).nullable().optional(),
  })
  .strict();

export type KeyStatus = { state: "unset" | "set" | "unreadable"; hint?: string };
export type TierView = { model: string; key: KeyStatus };
export type AiSettingsView = {
  encryptionReady: boolean;
  tiers: Record<Tier, TierView>;
};

export const speechSchema = z.object({ model, voice, instructions }).strict();
export type Speech = z.infer<typeof speechSchema>;

const languageName = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine(noControl)
  .refine((name) => name.toLowerCase() !== "other", '"Other" is built in.');
const languageCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^([a-z]{2,3}(-[a-z0-9]{2,8})?)?$/, "Use a code like sv or pt-br, or leave it empty.");

export const languageCreateSchema = z.object({ name: languageName, code: languageCode }).strict();
export const languageUpdateSchema = z
  .object({
    name: z.string().min(1).max(60),
    code: languageCode,
    hidden: z.boolean(),
    speech: speechSchema,
    plusSpeech: speechSchema,
  })
  .strict();
export const languageOrderSchema = z
  .object({ order: z.array(z.string().min(1).max(60)).min(1).max(500) })
  .strict();

export type LanguageView = z.infer<typeof languageUpdateSchema>;
export type ModelList = { chat: string[]; speech: string[] };
