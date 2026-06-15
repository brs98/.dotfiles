## Workflow Orchestration

### Isolated Workspaces, Not Bare Branches

- Prefer isolated workspaces/worktrees for repository tasks instead of working directly on the main checkout or switching branches in-place.
- Use the `patchtree` skill/workspace primitives when creating a task workspace.
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

## HTML Review Docs

- Whenever creating a standalone HTML document for user-review (reports, plans, prototypes, visual specs, audits, or other one-off artifacts), theme it with RiceKit by default.
- Prefer self-contained files: inline the stylesheet from `/Users/brandon/.agents/assets/ricekit-doc.css` in a `<style>` tag.
- The shared stylesheet imports RiceKit variables from `./rk-vars.css` when present and from `file:///Users/brandon/.config/ricekit/active/userstyles/rk-vars.css` by default, so review docs pick up the active RiceKit palette after reload when RiceKit changes themes.
- Do not override the styling of an existing production app, website, or design system unless explicitly asked; this applies only to agent-generated review artifacts.

Reference: `/Users/brandon/.agents/guidelines/html-review-docs.md`

## Self-Improvement

- When a reusable workflow or task is not obvious the first time, suggest creating a skill or reusable guide for it.
- Use the appropriate skill-authoring workflow when the user wants to capture a workflow as a reusable agent skill.

## Misc Tips

- When working with TypeScript projects, load/use the available TypeScript best-practices or doctor skill if the harness provides one.
- When working with React projects, load/use the available React best-practices or doctor skill if the harness provides one.
- When adding packages, use the project's package manager and avoid hardcoding package versions unless the project requires it.
