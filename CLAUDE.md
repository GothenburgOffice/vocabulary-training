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
- On GitHub, a `@claude` mention in an issue runs `.github/workflows/claude.yml`, which is
  read-only. Only when running in that workflow (the prompt says you are helping with a
  GitHub issue, and Bash/Edit/Write are denied): review the issue against the code on
  `main`; if it's already done or no longer applies, say so and suggest closing it; otherwise
  reply with a concrete plan (files, steps, tests owed, open questions). Don't try to change
  files or push there. This rule does not apply to local or devcontainer sessions, which
  work on issues as usual.
