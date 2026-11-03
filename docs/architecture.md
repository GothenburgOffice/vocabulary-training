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

Only `lib/server/` and the migration script touch PostgreSQL or secrets.

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
| `review_events`    | checked answer                           | the answer log: makes retries harmless, and is ready for #2                      |
| `runs`             | completed practice session               | the newest 200 are kept until #54 decides retention                              |
| `run_results`      | answer in a session                      | keeps the word's text, so history survives edits and deletions                   |

Every user table has `user_id` and the language pair (`native_language`,
`learning_language`), and the indexes lead with user, native, learning, so each
query seeks straight to one user's data for one pair. The pair copies on `words`,
`accepted_answers` and `word_reviews` follow their list through composite foreign
keys with `ON UPDATE CASCADE`. Sessions and results keep the pair they were
practised in.

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

`AccountApp` sends Workspace's changes one at a time, in order. A failed change
stays queued until an explicit retry.

Limits: 100 lists, 1,000 words per list, 200 sessions, 200 characters per word
and 500 per answer. CSV export contains word pairs only. Use database backups
for full recovery.

The database image includes pgvector (`CREATE EXTENSION vector` in migration
005), ready for the similarity search planned in #56.

## Learning formulas

- **Matching** (`normalize`, `isCorrect`): trims, collapses whitespace, treats
  typographic apostrophes alike, NFC-normalizes, and optionally ignores
  case or accents. An answer is correct if it matches any accepted answer for
  the prompt (`answersFor`).
- **Weighted order:** weighted random sampling. The weight is
  `1 + 3 × errorRate + (due ? 2 : 0)`, with Laplace-smoothed error rate.
- **Scheduling** (`reviewed`): correct answers double the interval, capped at
  30 days. A wrong answer resets the streak and is due again in 10 minutes.

## Runtime

Docker Compose runs `db` (PostgreSQL 18 with the pgvector extension), a one-shot `migrate` job, then `app`
(a standalone Next.js server, non-root). `compose.dev.yaml` swaps in the dev target
with the source mounted. `.devcontainer/` attaches VS Code to that dev container.
