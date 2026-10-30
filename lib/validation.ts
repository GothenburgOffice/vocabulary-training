import { z } from "zod";
const text = z.string().trim().min(1).max(200);
const language = z.string().trim().min(1).max(60);
const history = z.object({
  correct: z.number().int().min(0).max(1_000_000),
  wrong: z.number().int().min(0).max(1_000_000),
  streak: z.number().int().min(0).max(1_000_000),
  due: z.number().int().min(0).max(8640000000000000),
});
const word = z.object({
  id: z.string().min(1).max(100), front: text, back: text, forward: history, reverse: history,
});
const list = z.object({
  id: z.string().min(1).max(100), title: text, description: z.string().max(1000),
  from: language, to: language, words: z.array(word).min(1).max(1000),
}).refine(l => l.from !== l.to, "Languages must differ")
  .refine(l => new Set(l.words.map(w => w.id)).size === l.words.length, "Duplicate word identifiers");
export const workspaceSchema = z.object({
  baseLanguage: language, learningLanguage: language,
  lists: z.array(list).max(100),
  runs: z.array(z.object({
    id: z.string().max(100).optional(), completedAt: z.number().int().nonnegative().max(8640000000000000).optional(),
    title: text, from: language, to: language,
    results: z.array(z.object({
      word, answer: z.string().max(500), correct: z.boolean(), direction: z.enum(["forward", "reverse"]),
    })).min(1).max(1000),
  })).max(200),
}).refine(w => w.baseLanguage !== w.learningLanguage, "Languages must differ")
  .refine(w => new Set(w.lists.map(l => l.id)).size === w.lists.length, "Duplicate list identifiers");
export const saveSchema = z.object({ revision: z.number().int().nonnegative(), data: workspaceSchema });
export const credentialsSchema = z.object({
  action: z.enum(["login", "register"]),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
});
