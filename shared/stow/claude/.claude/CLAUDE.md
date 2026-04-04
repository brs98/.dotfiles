## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Agent Team Strategy

- Use agent teams for complex tasks requiring coordination across multiple areas
- Assign distinct roles (e.g., researcher, implementer, tester) for parallel execution
- Prefer teams over subagents when agents need to communicate or share context
- Keep teams small and focused — spawn only the teammates you actually need
- Load relevant skills for teammates (typescript-best-practices, react-best-practices, etc.)
- **Worktree isolation**: When spawning teammates that write code, NEVER use `isolation: "worktree"` on the Agent tool. The team lead MUST create the worktrees before teammates are spawned and tell each teammate what worktree it should work in — never share worktrees between teammates.
- **Teammate commit discipline**: Instruct each teammate to commit all their work before reporting completion. Include this in the teammate's prompt: "You MUST `git add` and `git commit` all changes before marking your task complete."

### 3. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

## Misc tips

- When working with typescript projects, always load the typescript-best-practices skill
- When working with react project, always load the react-best-practices skill
- When adding packages, ALWAYS use the project's package manager so the latest version is always installed. NEVER hardcode the package versions for packages you add.
