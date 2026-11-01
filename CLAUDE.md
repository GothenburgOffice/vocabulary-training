# CLAUDE.md

Guidance for Claude Code (and other contributors) working in this repository.

## Project

vocabulary.training: personal word lists and typed-recall practice. Next.js 16
(App Router), React 19, TypeScript, PostgreSQL 18 with pgvector, Docker Compose. Public repo
`GothenburgOffice/vocabulary-training`, MIT. See [README](README.md) and
[docs/architecture.md](docs/architecture.md).

## Environment

Docker-first. The host has no Node, so run everything in the dev container
(`.devcontainer/`, working dir `/app`). Outside it, prefix commands with
`docker compose -f compose.yaml -f compose.dev.yaml -f .devcontainer/compose.yaml exec -T app`.

```sh
npm run lint            # ESLint (flat config, eslint-config-next)
npm run format          # Prettier; CI runs format:check
npm run typecheck
npm test                # unit tests: tsx --test tests/*.test.ts
npm run test:integration  # needs the running stack; uses TEST_BASE_URL
npm run build
```

Before finishing a change, run lint, format:check, typecheck and the unit
tests. Also run the integration test when API, auth or DB code changed.

## Code map

- `lib/learning.ts`: pure matching, sampling, scheduling and CSV. Unit-test any change here.
- `lib/validation.ts`: Zod schemas for save requests. Update them with any change to the data shape.
- `lib/server/workspace-store.ts`: every query on the user data tables (`lists`, `words`,
  `word_reviews`, `runs`, `run_results`). Every query filters on `user_id`.
- `lib/server/**`: server-only (`import "server-only"`). DB, sessions, Requesty clients.
- `app/api/*/route.ts`: mutations call `requireOrigin` and then `requireUser`. Errors go through `HttpError`/`fail`.
- `app/admin/`: the admin area, a shell (`layout.tsx`, `components/admin/AdminNav.tsx`)
  with one module per section. To add a section: `app/admin/<slug>/page.tsx` (calls
  `adminPage()`), components in `components/admin/`, API in `app/api/admin/<slug>/`
  (`requireOrigin`, then `requireAdmin`), and an entry in `lib/admin/sections.ts`.
- `components/Workspace.tsx`: the whole UI, a client component. It and the
  components it renders must not import server code.
- `db/migrations/NNN_name.sql`: **append-only**. Never edit an applied migration; add a new file.

## Rules that must not regress

- Each AI call has one job. Keep it to that job:
  - **Language notes** (`/api/feedback`): after a wrong, non-skipped answer, a short
    note on how the attempt differs from the reference. The note explains; it never
    judges. It doesn't decide or change the grade, call the answer acceptable, or
    suggest new alternatives. It's requested only for wrong, non-skipped answers,
    enforced in the UI, the route and the adapter.
  - **Word audio** (`/api/speech`): reads one phrase aloud. Only plays on click, and
    the answer's audio button stays hidden until the answer is graded or skipped.
- Grading, statistics and scheduling are deterministic code.
- Send a provider only what its call needs: never account IDs or whole lists.
- Requesty keys are saved in the admin area, encrypted with `SETTINGS_ENCRYPTION_KEY`
  (`lib/server/secrets.ts`), and never sent to the browser: admin views show only whether
  a key is set and its last four characters. Never put a key or the encryption key in a
  `NEXT_PUBLIC_` variable, source, images or docs. Cost is controlled per key in Requesty
  (fallback policy, Access List, budget), not by app-side price checks.
- A feature without a key and a model is hidden. Speech is configured per language (six
  settings); plus falls back to basic. Tests use dummy keys and never call Requesty.
- Languages are hidden, never deleted or renamed: saved lists store the name.
- Lists belong to a base and target language pair. Changing the profile's base
  language never relabels or migrates lists. Base and target must differ.
- Answer normalization never rewrites stored text. Accents are strict by default.
- List saves carry a `revision`. A stale save must get 409, never overwrite. Reviews are
  applied on the server, so concurrent answers all count.
- Keep the book mark beside the wordmark, and keep the one- and two-line
  wordmarks working at all sidebar widths.

## Workflow

- **Decisions and planned work live in GitHub issues.** Use the `decision` label
  for open questions. Record the outcome in the issue before closing it, and link
  the PR that implements it. Don't add decision logs or dated verification
  reports to the repo.
- Never label issues `good first issue` or `help wanted`. The owner applies
  `help wanted` by hand when they want outside help (see [CONTRIBUTING.md](CONTRIBUTING.md)).
- `notes/` is gitignored, for private scratch and session notes only. Nothing there is public.
- Branch from `main`, open a PR, and let CI pass. Pushing to `main` publishes the
  GHCR image, so only push or merge with the owner's go-ahead.
- Keep formatting-only changes in separate commits, and add them to `.git-blame-ignore-revs`.
- Never run `docker compose down -v` on a stack with real data.
- Stay compatible with **Node 22** (`engines`, Dockerfile, CI) for broad hosting
  support. Don't use APIs that need a newer Node. PostgreSQL major upgrades need a
  data migration plan, so Dependabot skips major updates for both.
- `main` is protected: changes go through a PR, and the `unit` and `containers` checks must pass.
