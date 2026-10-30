# Source architecture map

Graphify's pinned structural extractor was run on the source-only TypeScript,
TSX and JavaScript corpus. Dependencies, generated Next.js output, credentials,
original-site distribution, documentation and database data were excluded.
This map is a navigation aid, not a runtime trace or a security audit.

## Main paths

- **Account entry:** `app/page.tsx` renders `components/AccountApp.tsx`.
  That shell loads the authenticated workspace, serializes debounced saves,
  retains failed edits in the current tab and exposes explicit retry.
- **Vocabulary workspace:** `components/Workspace.tsx` renders library, editor,
  practice, results and history. It uses the independent directional histories
  and pure sampling/review functions in `lib/learning.ts`.
- **Authentication:** `app/api/auth/route.ts` uses `lib/server/auth.ts` for
  sessions and throttling and `lib/server/password.ts` for hashing.
- **Saved data:** `app/api/workspace/route.ts` combines `requireUser`,
  request safeguards, `lib/validation.ts` and an ownership/revision-checked
  PostgreSQL update.
- **Database boundary:** only server modules and the migration runner access
  PostgreSQL. The sample preview receives shared UI and formulas, not server code.

## Extraction result and limits

The structural run found 131 graph nodes and 298 directed graph edges across
23 supported source files, with ten algorithmic communities. Community labels
were assigned after inspecting their member symbols. No semantic-model
extraction was performed.

Raw extraction contained 307 relations. The health diagnostic identified nine
same-endpoint relation collapses, one dangling endpoint and 32 external-reference
relations; raw relations were retained outside the repository for analysis.
Three files produced no modeled symbols: the health-wait helper and the two
unit-test files. SQL, Compose and security behavior were inspected separately,
not inferred from this source graph.

The `Workspace` component remains the largest UI unit. Splitting its editor,
practice and library views is a reasonable later refactor, not a prerequisite
for this initial account-backed release.
