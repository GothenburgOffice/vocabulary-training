# vocabulary.training

The shared project reference for coding agents (also read by Copilot):

@.github/copilot-instructions.md

## Claude Code specifics

- Claude Code's sign-in and settings persist in the dev container's `claude-config`
  volume (`CLAUDE_CONFIG_DIR=/root/.claude`). Project memory is bind-mounted from
  `~/.claude-memory/vocabulary-training` on the host (`CLAUDE_MEMORY_DIR` overrides it)
  at `/root/.claude/projects/-app/memory`. The README's "Claude Code memory" section has
  the one-time steps for sharing it with Claude Code on a Windows host.
- Never delete `vocabulary.training.code-workspace`: VS Code closes with it and the
  session is lost.
- Assign every pull request you open to `hkarn`, so it shows up in the owner's GitHub
  views: `gh pr create --assignee hkarn`, or `gh pr edit <N> --add-assignee hkarn` for a
  pull request opened another way (a GitHub MCP tool, or a draft the environment opened).
- Review comments, from Copilot or a person: check each claim against the code first, fix
  what is real in a new commit, and reply on the thread with what you found and what
  changed (or why nothing did). Never resolve a conversation; the owner does.
- Never merge, approve or enable auto-merge on a pull request; the owner's merge is the
  approval.
- Sign everything you post on GitHub (pull request descriptions, issues, comments and
  review replies) with a last line
  `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- On GitHub, a `@claude` mention in an issue runs `.github/workflows/claude.yml`, which is
  read-only. Only when running in that workflow (the prompt says you are helping with a
  GitHub issue, and Bash/Edit/Write are denied): review the issue against the code on
  `main`; if it's already done or no longer applies, say so and suggest closing it; otherwise
  reply with a concrete plan (files, steps, tests owed, open questions). Don't try to change
  files or push there. Every other session, wherever it runs, works on issues as usual.
