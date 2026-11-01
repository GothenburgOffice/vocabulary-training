# Architecture

## Layout

| Path                                              | Responsibility                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `app/page.tsx`                                    | Renders `AccountApp`                                                                         |
| `components/AccountApp.tsx`                       | Sign-in, loads the workspace, debounced and serialized saves, retry, unsaved-changes warning |
| `components/Workspace.tsx`                        | The whole UI: library, editor, CSV, practice, results, history                               |
| `components/LanguageNote.tsx`, `SpeechButton.tsx` | Optional AI note and audio controls                                                          |
| `lib/learning.ts`                                 | Pure functions: answer matching, sampling, review scheduling, CSV                            |
| `lib/validation.ts`                               | Zod schemas for saved data and credentials                                                   |
| `lib/server/`                                     | Server-only: DB pool, sessions, password hashing, HTTP helpers, Requesty clients             |
| `app/api/*/route.ts`                              | `auth`, `workspace`, `feedback`, `speech`, `health`                                          |
| `db/migrations/`                                  | Append-only SQL migrations, applied by `scripts/migrate.mjs`                                 |

Only `lib/server/` and the migration script touch PostgreSQL or secrets.

## Data model

PostgreSQL holds `users`, `sessions` (token hashes), `auth_limits` (sign-in
throttling), `schema_migrations`, and one `workspaces` row per user. That row
is a versioned JSONB document with the profile languages, all lists (each word
carries forward/reverse review history) and up to 200 completed sessions.

Every save sends the whole document plus its `revision`. A single `UPDATE … WHERE
revision = $n` checks ownership and revision and increments it. A stale tab gets
HTTP 409 and keeps its unsaved data.

Limits: 100 lists, 1,000 words per list, 200 sessions, 200 characters per word,
500 per answer, and 2 MB per request (often reached before the count limits).
CSV export contains word pairs only. Use database backups for full recovery.

Moving to normalized tables with incremental saves: [#1](https://github.com/GothenburgOffice/vocabulary-training/issues/1).

## Learning formulas

- **Matching** (`normalize`, `isCorrect`): trims, collapses whitespace, treats
  typographic apostrophes alike, NFC-normalizes, and optionally ignores
  case or accents. `|` separates accepted alternatives.
- **Weighted order:** weighted random sampling. The weight is
  `1 + 3 × errorRate + (due ? 2 : 0)`, with Laplace-smoothed error rate.
- **Scheduling** (`reviewed`): correct answers double the interval, capped at
  30 days. A wrong answer resets the streak and is due again in 10 minutes.

## Runtime

Docker Compose runs `db` (PostgreSQL 18 with the pgvector extension), a one-shot `migrate` job, then `app`
(a standalone Next.js server, non-root). `compose.dev.yaml` swaps in the dev target
with the source mounted. `.devcontainer/` attaches VS Code to that dev container.
