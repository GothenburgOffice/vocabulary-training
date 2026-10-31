# CLAUDE.md

Guidance for Claude Code (and other contributors) working in this repository.

## Project

vocabulary.training: personal word lists and typed-recall practice. Next.js 16
(App Router), React 19, TypeScript, PostgreSQL 17, Docker Compose. Public repo
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
- `lib/validation.ts`: Zod schemas. Update them with any change to the workspace shape.
- `lib/server/**`: server-only (`import "server-only"`). DB, sessions, Requesty clients.
- `app/api/*/route.ts`: mutations call `requireOrigin` and then `requireUser`. Errors go through `HttpError`/`fail`.
- `components/Workspace.tsx`: the whole UI. It's shared with the static design
  preview via `scripts/sync-preview.mjs`, so it and the files that script copies
  must not import server code.
- `db/migrations/NNN_name.sql`: **append-only**. Never edit an applied migration; add a new file.

## Rules that must not regress

- Grading, statistics and scheduling are deterministic. AI never grades,
  accepts alternatives or edits words.
- AI language notes are requested **only** for wrong, non-skipped answers, and
  this is enforced in the UI, the route and the adapter. Never send account
  IDs or whole lists to a provider.
- `REQUESTY_API_KEY` stays server-side: never a `NEXT_PUBLIC_` variable, and never in source, images or docs.
  Paid models stay off unless `REQUESTY_ALLOW_PAID_MODELS=true`.
- The answer audio button is hidden until the answer is graded or skipped. Audio only plays on click.
- Lists belong to a base and target language pair. Changing the profile's base
  language never relabels or migrates lists. Base and target must differ.
- Answer normalization never rewrites stored text. Accents are strict by default.
- Saves carry a `revision`. A stale save must get 409, never overwrite.
- Keep the book mark beside the wordmark, and keep the one- and two-line
  wordmarks working at all sidebar widths.

## Workflow

- **Decisions and planned work live in GitHub issues.** Use the `decision` label
  for open questions. Record the outcome in the issue before closing it, and link
  the PR that implements it. Don't add decision logs or dated verification
  reports to the repo.
- `notes/` is gitignored, for private scratch and session notes only. Nothing there is public.
- Branch from `main`, open a PR, and let CI pass. Pushing to `main` publishes the
  GHCR image, so only push or merge with the owner's go-ahead.
- Keep formatting-only changes in separate commits, and add them to `.git-blame-ignore-revs`.
- Never run `docker compose down -v` on a stack with real data.
- Stay compatible with **Node 22** (`engines`, Dockerfile, CI) for broad hosting
  support. Don't use APIs that need a newer Node. PostgreSQL major upgrades need a
  data migration plan, so Dependabot skips major updates for both.
- `main` is protected: changes go through a PR, and the `unit` and `containers` checks must pass.
