import { z } from "zod";
const text = z.string().trim().min(1).max(200);
const language = z.string().trim().min(1).max(60);
const id = z.string().uuid();
const direction = z.enum(["forward", "reverse"]);
const timestamp = z.number().int().nonnegative().max(8640000000000000);

// PUT /api/lists/:id: the whole list with its words, as the editor saves it. revision is the
// one last loaded or saved, or null for a new list.
export const listSaveSchema = z
  .object({
    revision: z.number().int().positive().nullable(),
    list: z
      .object({
        title: text,
        description: z.string().max(1000),
        from: language,
        to: language,
        // back is the primary answer; accepted holds further answers (from CSV for now).
        words: z
          .array(
            z.object({ id, front: text, back: text, accepted: z.array(text).max(20).default([]) }),
          )
          .min(1)
          .max(1000),
      })
      .refine((l) => l.from !== l.to, "Languages must differ")
      .refine(
        (l) => new Set(l.words.map((w) => w.id)).size === l.words.length,
        "Duplicate word identifiers",
      ),
  })
  .strict();
// POST /api/reviews: one checked answer, with an id the client makes once per answer, so a
// retry isn't counted twice. The server applies reviewed() with its own clock.
export const reviewSchema = z.object({ id, wordId: id, direction, correct: z.boolean() }).strict();
// POST /api/runs: a completed session, with the text of each word as it was practised.
export const runSaveSchema = z
  .object({
    id,
    listId: id.nullable(),
    title: text,
    mode: z.string().max(40),
    from: language,
    to: language,
    completedAt: timestamp,
    results: z
      .array(
        z.object({
          word: z.object({ id, front: text, back: text }),
          answer: z.string().max(500),
          correct: z.boolean(),
          direction,
          answeredAt: timestamp,
        }),
      )
      .min(1)
      .max(1000),
  })
  .refine((r) => r.from !== r.to, "Languages must differ");
// PATCH /api/profile.
export const profileSchema = z
  .object({ baseLanguage: language, learningLanguage: language })
  .strict()
  .refine((p) => p.baseLanguage !== p.learningLanguage, "Languages must differ");
// Only a fixed-length scrypt hash is stored, so the cap just bounds the hashing work.
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 4096;
export const credentialsSchema = z.object({
  action: z.enum(["login", "register"]),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  password: z
    .string()
    .min(PASSWORD_MIN, `Use a password of at least ${PASSWORD_MIN} characters.`)
    .max(PASSWORD_MAX, `Use a password of at most ${PASSWORD_MAX} characters.`),
});
