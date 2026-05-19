## Workflow Orchestration

### 0a. Worktrees - Not Branches

- Always use worktrees via the worktrunk skill. Don't use branches. Worktrees enable parallelized development.

### 3. Subagent Strategy

- Use subagents liberally to keep main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, throw more compute at it via subagents.
- One task per subagent for focused execution.
