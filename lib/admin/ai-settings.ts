// Shapes shared by the admin pages and app/api/admin/{ai,languages,models}.
import { z } from "zod";

const noControl = (value: string) => !/[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value);
const model = z.string().trim().max(200).refine(noControl, "Remove control characters.");
const voice = z.string().trim().max(60).refine(noControl, "Remove control characters.");
const instructions = z.string().trim().max(2000).refine(noControl, "Remove control characters.");

export const tierSchema = z.enum(["basic", "plus"]);
export type Tier = z.infer<typeof tierSchema>;

// apiKey: omitted keeps the stored key, null clears it, a string replaces it.
const apiKey = z.string().trim().min(1).max(500).refine(noControl).nullable().optional();
export const tierUpdateSchema = z
  .object({ tier: tierSchema, model: model.optional(), apiKey })
  .strict();

// The read-only Requesty management key (#121), and the key label value that marks this
// app's keys in a Requesty organisation that may hold other apps' keys too.
export const DEFAULT_APP_LABEL = "vocabulary-training";
export const monitorUpdateSchema = z
  .object({
    apiKey,
    appLabel: z
      .string()
      .trim()
      .min(1, "Enter the label value, for example vocabulary-training.")
      .max(100)
      .regex(/^[A-Za-z0-9._:-]+$/, "Use letters, digits and . _ : - in the label.")
      .optional(),
  })
  .strict();

// Creating the monitor key in Requesty: a full-rights admin key, used once and never stored,
// and the new key's name.
export const DEFAULT_MONITOR_NAME = "Vocabulary admin monitor";
export const monitorCreateSchema = z
  .object({
    adminKey: z.string().trim().min(1, "Enter a Requesty admin key.").max(500).refine(noControl),
    name: z
      .string()
      .trim()
      .min(1, "Name the new key.")
      .max(100)
      .refine(noControl, "Remove control characters."),
    // Also label the saved tier keys app=<app label>, tier=basic|plus with the admin key.
    labelTiers: z.boolean().optional(),
  })
  .strict();
export type MonitorCreated = {
  apiKey: string;
  labelled: { tier: Tier; name: string }[];
  problems: string[];
};

export type KeyStatus = { state: "unset" | "set" | "unreadable"; hint?: string };
type TierView = { model: string; key: KeyStatus };
export type MonitorView = { key: KeyStatus; appLabel: string };
export type AiSettingsView = {
  encryptionReady: boolean;
  tiers: Record<Tier, TierView>;
  monitor: MonitorView;
};

// Speech calls go straight to a model: SpeechService refuses policies, so they're refused here
// too instead of saving a setting that always fails.
const speechModel = model.refine(
  (value) => !value.startsWith("policy/"),
  "Speech needs a model; Requesty policies only work for language notes.",
);
export const speechSchema = z.object({ model: speechModel, voice, instructions }).strict();
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
// revision is the one loaded with the language; a save made from an older one gets 409.
export const languageUpdateSchema = z
  .object({
    name: z.string().min(1).max(60),
    revision: z.string().regex(/^\d{1,20}$/),
    code: languageCode,
    hidden: z.boolean(),
    highlighted: z.boolean(),
    speech: speechSchema,
    plusSpeech: speechSchema,
  })
  .strict();

export type LanguageView = z.infer<typeof languageUpdateSchema>;
export type ModelList = { chat: string[]; speech: string[] };
