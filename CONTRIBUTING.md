# Contributing

This is a small, owner-maintained project. Review time is limited, so outside
contributions are accepted only on the terms below.

## Before you write code

Only work on an issue if one of these is true:

1. It has the **`help wanted`** label, or
2. You commented on the issue with what you plan to do, and a maintainer
   **replied approving it**.

Everything else, including issues labelled `decision`, needs that approval
first. If there's no issue for your idea, open one and wait for a reply.

**Pull requests that don't meet this will probably be closed without review.**
That includes unsolicited fixes, refactors, dependency bumps and typo-only changes.

## Pull request requirements

- Link the issue (`Closes #123`) and keep the change limited to it.
- Branch from an up-to-date `main`. Merging needs passing CI and an up-to-date branch.
- Before pushing, run `npm run format`, `npm run lint`, `npm run typecheck` and `npm test`. Run `npm run test:integration` too if you changed API, auth or database code.
  The [dev container](README.md#development) has everything set up.
- Add or update tests for behavior changes.
- Follow the rules in [CLAUDE.md](CLAUDE.md), for example: grading stays
  deterministic, API keys stay server-side, migrations are append-only, and the app stays Node 22 compatible.
- **Disclose AI assistance** in the PR description, and say what you ran yourself.

## Security issues

Don't open public issues for vulnerabilities. Use
[GitHub private vulnerability reporting](https://github.com/GothenburgOffice/vocabulary-training/security/advisories/new) instead.

## License

By contributing you agree that your contribution is licensed under the
[MIT License](LICENSE).
