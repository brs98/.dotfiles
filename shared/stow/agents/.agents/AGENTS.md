## Workflow Orchestration

### Isolated Workspaces, Not Bare Branches

- Prefer isolated workspaces/worktrees for repository tasks instead of working directly on the main checkout or switching branches in-place.
- Use native Git worktrees when creating a task workspace.
- Do not share one writable workspace across parallel implementation agents.

### Agent Team and Subagent Strategy

- Use subagents liberally to keep the main context clean.
- Offload research, exploration, review, and parallel analysis to focused subagents.
- For complex problems, throw more compute at it via subagents or agent teams.
- One task per subagent for focused execution.

## Security

- Do not read sensitive information unless explicitly asked.
- Never leak API keys, tokens, secrets, credentials, or private data.
- If sensitive data is encountered accidentally, do not repeat it; summarize only that sensitive data was present.

## Misc Tips

- When working with TypeScript projects, load/use the available TypeScript best-practices or doctor skill if the harness provides one.
- When working with React projects, load/use the available React best-practices or doctor skill if the harness provides one.
- When adding packages, use the project's package manager and avoid hardcoding package versions unless the project requires it.
