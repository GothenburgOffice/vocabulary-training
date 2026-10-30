# Application architecture

The deployable application and sample-data preview reuse `components/Workspace.tsx`.
The account-backed entry point wraps that UI with authentication, load, autosave,
retry, concurrent-edit protection and sign-out controls.

## Boundaries

- **UI:** `components/Workspace.tsx` owns language-pair filtering, editor, CSV,
  testing, feedback, results and history. `lib/learning.ts` contains pure formulas.
- **Account shell:** `components/AccountApp.tsx` loads account state, debounces
  saves, serializes writes, exposes errors and warns before leaving unsaved data.
- **API:** `app/api/auth` handles registration, sign-in, sign-out and session lookup.
  `app/api/workspace` reads and updates only the authenticated user's workspace.
  Request bodies and limits are validated with Zod.
- **PostgreSQL:** normalized `users` and `sessions`, one versioned JSONB workspace
  per user, migration ledger, database-backed authentication rate limits.
- **Runtime:** Docker Compose runs PostgreSQL, a one-shot migration job and a
  non-root standalone Next.js server. The database has no published host port.

## Data and concurrency

A workspace contains profile language settings, lists with word-level review
history, and up to 200 completed sessions. Its JSONB boundary deliberately matches
the first version's UI aggregate; this is not a claim of a normalized relational
word schema. A future reporting feature can add normalized tables through
non-destructive migrations.

Every save includes a revision. A single SQL update checks user ownership and the
revision and increments it atomically. A stale tab receives HTTP 409 and retains
its unsaved data; it does not overwrite another tab. Reload only after exporting
any unsaved words. Retry resends the same revision and cannot override a conflict.

Lists and progress are persisted after each checked answer. An unfinished quiz
keeps its checked answers but does not enter completed-session history. An active
question/queue is not resumable after reload. Review dates use device time in the
account app and a fixed illustrative clock in the preview.

## Limits

100 lists, 1,000 words per list, 200 completed sessions, 200 characters per word
side, 500 characters per typed answer, and a 2 MB maximum workspace request.
The aggregate 2 MB limit may be reached before the individual count limits.
This first version is intended for small personal workspaces.

CSV export preserves word pairs, not the complete workspace or review history.
Use PostgreSQL backups for durable full-account recovery.
