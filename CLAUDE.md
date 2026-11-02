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
