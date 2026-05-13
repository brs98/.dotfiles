# Parallelize — Reference

## Agent Prompt Template

Use this template when constructing the prompt for each spawned agent. Replace placeholders (`<...>`) with actual values.

```
You are implementing a task in an isolated git worktree.

## Your Task
<task description — plain text, Linear issue details, or both>

## Your Worktree
Path: <worktree-path>
Branch: <branch-name>

You MUST `cd <worktree-path>` before doing any work. All file operations must happen within this worktree.

## Instructions

1. **Explore** the codebase to understand the architecture and patterns relevant to your task
2. **Design** your implementation approach — document key design decisions in the PR description
3. **Implement** the changes following existing code patterns and conventions
4. **Run push checks** — ensure husky pre-push hooks pass (typecheck, lint, format, build, etc.):
   - Check `.husky/` directory and `package.json` scripts for the exact commands
   - Fix any issues before proceeding
5. **Commit** all changes:
   ```bash
   git add <files>
   git commit -m "<descriptive commit message>"
   ```
6. **Push and open a PR**:
   ```bash
   git push -u origin <branch-name>
   gh pr create --base main --title "<PR title>" --body "$(cat <<'EOF'
   ## Summary
   <what this PR does and why>

   ## Design Decisions
   <key choices made during implementation>

   ## Test Plan
   <how to verify this works>
   EOF
   )"
   ```
7. **Report back** with: branch name, PR URL, summary of changes, any issues encountered

You MUST `git add` and `git commit` all changes before marking your task complete.

## Important
- Work ONLY in your assigned worktree — do NOT modify files outside `<worktree-path>`
- If you encounter a question or blocker, report it clearly — do not guess
- Follow existing code patterns and conventions you find in the codebase
```

### Linear Issue Addendum

When a Linear issue is provided, append this to the agent prompt:

```
## Linear Issue
ID: <issue-id>
Title: <issue-title>
Description: <issue-description>
Acceptance Criteria: <acceptance-criteria>

When starting work, update the Linear issue status to "In Progress" using the Linear MCP tools.
After opening the PR, link it to the Linear issue.
```

## Overlap Analysis Presentation Format

Present the overlap analysis to the user like this before proceeding:

```
## Overlap Analysis

### Independent Tasks (fully parallel)
- "Add logging middleware" → predicted files: src/middleware/logging.ts, src/config/logger.ts
- "Fix date parsing bug" → predicted files: src/utils/dates.ts, src/utils/__tests__/dates.test.ts

### Stack Group A — small overlap (parallel, then stack)
- "Add auth endpoint" → predicted files: src/api/routes.ts, src/auth/handler.ts, src/auth/middleware.ts
- "Add user profile endpoint" → predicted files: src/api/routes.ts, src/users/handler.ts
  Shared: src/api/routes.ts (additive — both add new routes)

### Stack Group B — significant overlap (sequential)
- "Refactor validation layer" → predicted files: src/validation/index.ts, src/validation/rules.ts, src/api/middleware.ts
- "Add custom validation rules" → predicted files: src/validation/rules.ts, src/validation/custom.ts, src/api/middleware.ts
  Shared: src/validation/rules.ts, src/api/middleware.ts (structural changes, 2+ files)

### Execution Plan
- Phase 1 (parallel): Independent tasks + Stack Group A agents launch together
- Phase 2 (sequential): Stack Group B agents run one at a time
- Post: Stack Group A and B PRs get chained via /stacked-prs

Proceed? (Y/n)
```

### Overlap Severity Decision Guide

| Signal | Small Overlap | Significant Overlap |
|--------|--------------|-------------------|
| Shared file count | 1-2 files | 3+ files |
| Nature of changes | Additive (new exports, new routes, new entries) | Structural (refactoring, renaming, reorganizing) |
| Conflict likelihood | Low — changes are in different sections | High — changes affect the same code paths |
| Execution | Parallel, stack after | Sequential within group |

When in doubt, default to **small overlap** (parallel). False negatives are acceptable — conflicts can be resolved at merge time.

## Summary Table Format

After all agents complete, present:

```
## Parallelize Results

| # | Task | Branch | PR | Status | Stack |
|---|------|--------|----|--------|-------|
| 1 | Add auth endpoint | feat/add-auth | #42 | open | Stack A (1/2) |
| 2 | Add profile endpoint | feat/add-profile | #43 | open | Stack A (2/2) |
| 3 | Add logging middleware | feat/add-logging | #44 | open | Independent |
| 4 | Fix date parsing | feat/fix-dates | — | failed | — |

### Failures
- **Fix date parsing**: <error summary from agent>

### Active Worktrees
| Branch | Path |
|--------|------|
| feat/add-auth | /path/to/worktree/feat/add-auth |
| feat/add-profile | /path/to/worktree/feat/add-profile |
| feat/add-logging | /path/to/worktree/feat/add-logging |

After all PRs are merged, I can clean up these worktrees with `wt remove`.
```

## Post-Merge Cleanup

When the user confirms PRs are merged, clean up each worktree:

```bash
# For each merged PR's branch
wt remove <branch-name>
```

If some PRs are still open, only remove worktrees for merged ones. Report what was cleaned and what remains.
