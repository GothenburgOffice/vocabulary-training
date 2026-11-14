# Architecture

## Layout

| Path                                              | Responsibility                                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `app/page.tsx`                                    | Renders `AccountApp`                                                                       |
| `components/AccountApp.tsx`                       | Sign-in, loads the workspace, sends each change in order, retry, unsaved-changes warning   |
| `components/Workspace.tsx`                        | The signed-in UI's state and saves; renders the views in `components/workspace/`           |
| `components/workspace/`                           | Views (library, editor, practice, results, history), sidebar and dialogs                   |
| `components/LanguageNote.tsx`, `SpeechButton.tsx` | Optional AI note and audio controls                                                        |
| `lib/learning.ts`                                 | Pure functions: answer matching, sampling, review scheduling, CSV                          |
| `lib/practice.ts`                                 | A practice session: reducer, grading, choosing the words                                   |
| `lib/validation.ts`                               | Zod schemas for save requests and credentials                                              |
| `lib/server/`                                     | Server-only: DB pool, user data store, sessions, passwords, HTTP helpers, Requesty clients |
| `app/api/*/route.ts`                              | `auth`, `workspace`, `lists/[id]`, `reviews`, `runs`, `profile`, `feedback`, `speech`, …   |
| `db/migrations/`                                  | Append-only SQL migrations, applied by `scripts/migrate.mjs`                               |

Only `lib/server/` and the migration scripts touch PostgreSQL or secrets: routes and pages
call its functions (`workspace-store.ts`, `accounts.ts`, `auth.ts`, …) and never run SQL.

## Data model

PostgreSQL holds `users` (with the profile's native and learning language),
`sessions` (token hashes), `auth_limits` (sign-in throttling), the admin's
`site_settings` (encrypted Requesty keys and models, and the public privacy
controller and contact) and `languages`, and the user data in normalized tables:

| Table              | One row per                              | Notes                                                                            |
| ------------------ | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `lists`            | word list                                | `revision` for conflict checks; `visibility` is always `private` (#55)           |
| `words`            | word in a list: its native prompt        | `native_key`; `is_public` (#55)                                                  |
| `accepted_answers` | answer accepted in the learning language | position 0 is the primary answer; `learning_key` for matching across lists (#56) |
| `word_reviews`     | word and prompt (which side was shown)   | the current review state; no row means never answered that way                   |
| `review_events`    | checked answer                           | the answer log: makes retries harmless, and is ready for #128                    |
| `runs`             | completed practice session               | the newest 200 are kept until #54 decides retention                              |
| `run_results`      | answer in a session                      | keeps the word's text, so history survives edits and deletions                   |

Every user table has `user_id` and the language pair (`native_language`,
`learning_language`), and the indexes lead with user, native, learning, so each
query seeks straight to one user's data for one pair. The pair copies on `words`,
`accepted_answers` and `word_reviews` follow their list through composite foreign
keys with `ON UPDATE CASCADE`. Sessions and results keep the pair they were
practised in.

### Names for the language pair

The same two languages go by different names in different layers. The columns keep their
names (renaming them isn't worth a migration); the TypeScript names follow the UI.

| Meaning                                | Database            | Workspace, UI, `AiWord` | Lists and runs |
| -------------------------------------- | ------------------- | ----------------------- | -------------- |
| The language the learner already knows | `native_language`   | `baseLanguage`          | `from`         |
| The language being learned             | `learning_language` | `learningLanguage`      | `to`           |

A word's own text follows the database: `native_text` (`native` on `AiWord`, the "native"
speech part) and its accepted answers in the learning language. The AI inputs
(`lib/feedback.ts`) use `sourceLanguage` and `targetLanguage` for something else: the
direction of one answer, so in reverse practice the source is the learning language.
`explanationLanguage` there is always the base language.

`answer_timing` holds, per account and input type (keyboard or touchscreen), only the
running averages of answer hesitation (#2); it has no language pair. `answer_timing_buckets`
counts scored answers per score step site-wide, with no account, for Admin → Answer timing.

`issue_reports` holds the AI results learners report (#95), one row per result.
It is anonymous by design: no `user_id`, dates instead of times, and a hashed
result id, so a report can't be matched to an account through `ai_usage`, and it
outlives the account. It is read newest first only (`issue_reports_recent_idx`).
It has no language pair: a report names the word's own
language. Its queries are in `lib/server/reports-store.ts`. Recent AI results
before a report live only in the browser (see [AI features](ai-features.md)).

A word is a native prompt with one or more accepted answers. Practising forward
(native shown) accepts any of them; practising in reverse shows the primary
answer and accepts only the native text. The UI edits the primary answer; CSV
import and export carry the others, separated by `|` in the file only (`\|` and `\\`
are a literal `|` and `\`).

The key columns (`native_key`, `learning_key`) are generated by the database with
`vocabulary_key()`: NFC, the standalone apostrophes `` ` `` `´` `‘` `’` as `'`,
whitespace trimmed and collapsed, lowercase, final sigma folded, accents kept. It
matches grading's `normalize()` with default settings. Keys never replace the
stored text, and only keys made by that function are compared with each other.

Saves are small and incremental:

- `PUT /api/lists/:id` creates (`revision: null`) or replaces a list and its
  words, with the list's `revision`. A stale save gets 409, never an overwrite.
  Words keep their review state while their id stays.
- `POST /api/reviews` records one checked answer, with an id the client makes
  per answer. The server applies `reviewed()` with its own clock, under a row
  lock, so answers from two tabs both count, and logs the answer in
  `review_events`, so a retried request is counted once. It returns the new
  state, which the tab takes unless a later answer for that word is pending.
- `POST /api/runs` saves a completed session once; `PATCH /api/profile` saves
  the profile languages, or the Appearance setting (`{ theme }`) on its own. The root
  layout reads the setting with the session and sets `<html data-theme>`, so pages paint
  in the right scheme; the colour tokens in `app/style.css` use `light-dark()`.
- `GET /api/workspace` is the full dump, in the shape the client works with.
- `GET /api/export` downloads the same data for people to keep (`lib/export.ts`), from one
  read-only snapshot: ISO times, plus the account row, the answer log (`review_events`)
  and the AI usage records. There is no import for it.

`AccountApp` sends Workspace's changes one at a time, in order. A failed change
stays queued until an explicit retry.

Limits: 100 lists, 1,000 words per list, 200 sessions, 200 characters per word
and 500 per answer. CSV export contains word pairs only, and the JSON data export has no
import. Use database backups for full recovery.

The database image includes pgvector (`CREATE EXTENSION vector` in migration
005), ready for the similarity search planned in #56.

## Learning formulas

- **Matching** (`normalize`, `isCorrect`): trims, collapses whitespace, treats
  typographic apostrophes alike, NFC-normalizes, and optionally ignores
  case or accents. An answer is correct if it matches any accepted answer for
  the prompt (`answersFor`).
- **Practice modes** (`practiceQueue` in `lib/practice.ts`) only pick and order
  a session's words; every answer is graded and scheduled the same way.
  - **Weighted mix** (`weightedOrder`, mode id `adaptive`): weighted random
    sampling. The weight is `1 + 3 × errorRate + (due ? 2 : 0)`, with a
    Laplace-smoothed error rate.
  - **Spaced review** (`spacedOrder`, `spaced`): due words by retrievability,
    lowest first; then new words in list order; then the rest by retrievability,
    up to the session size.
  - **Random order** (`randomOrder`, `random`): a uniform shuffle.
- **Scheduling** (`reviewed`, #2): [FSRS](https://github.com/open-spaced-repetition/ts-fsrs)
  (`ts-fsrs` 5.x; 6.x needs Node 24) with its default weights, 90% target
  retention, learning steps of 1 and 10 minutes, a 10-minute relearning step and
  no fuzz, so it is deterministic. A right answer is Good and a wrong or skipped
  one Again; there are no Hard or Easy grades yet. Every answer in every mode
  updates the one memory state per word and direction (`word_reviews`: stability,
  difficulty, state, steps, lapses, last review), and FSRS sets `due_at`.
  `streak` only counts consecutive right answers, for the library's labels.
- **Answer timing** (`lib/timing.ts`, #2): collected to calibrate a future Hard
  grade (#128); it changes no grade or review date yet. Typing speed is left out, since it
  varies between people and devices. For a right, typed answer, the browser
  measures, with the tab visible, the time before the first keystroke and, of each
  pause between keystrokes (and before the check), the part longer than the input
  type's cutoff (Admin → Answer timing; 1000 ms keyboard, 1500 ms touchscreen,
  where touch means `(pointer: coarse)`). The server turns that into a score,
  `log(1 + seconds)`, and keeps per account and input type only its running mean
  and variance (the plain average for the first answers, then a moving one,
  α = 0.05). Once an account has 20 answers on an input type, each new one is also
  scored in standard deviations above that usual, and counted, without the
  account, in quarter steps, so admin can see what share each Hard threshold
  would mark. Answers over 2 minutes are left out.

## Runtime

Docker Compose runs `db` (PostgreSQL 18 with the pgvector extension), a one-shot `migrate` job, then `app`
(a standalone Next.js server, non-root). `compose.dev.yaml` swaps in the dev target
with the source mounted. `.devcontainer/` attaches VS Code to that dev container.
