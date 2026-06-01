## Workflow Orchestration

### Workspaces - Not Branches

- Always use isolated workspaces via the `patchtree` skill. Don't use branches directly. Patchtree workspaces enable parallelized development with cheap native per-task directories.

### Subagent Strategy

- Use subagents liberally to keep main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, throw more compute at it via subagents.
- One task per subagent for focused execution.

### Security

- Do not read sensitive information unless explicitly asked.
- Never leak API keys, tokens, secrets, credentials, or private data.
- If sensitive data is encountered accidentally, do not repeat it; summarize only that sensitive data was present.

### Self-Improvement

- When a reusable workflow or task is not obvious the first time, suggest creating a skill for it.
- Use the `write-a-skill` skill when the user wants to capture that workflow as a reusable agent skill.
