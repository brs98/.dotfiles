---
name: parallelize
description: Orchestrate parallel implementation of multiple tasks across isolated git worktrees using agent teams. Analyzes task overlap, creates worktrees via worktrunk, spawns agents to implement and open PRs, and stacks overlapping PRs automatically. Use when user wants to parallelize work items, implement multiple tasks simultaneously, work on multiple features at once, or mentions "parallelize".
---

# Parallelize

Implement multiple tasks in parallel by spawning agent teams across isolated git worktrees. Overlapping work is automatically detected and stacked.

**Announce at start:** "I'm using the parallelize skill to implement N tasks across isolated worktrees."

## Prerequisites

- `wt` (worktrunk CLI) installed
- `gh` (GitHub CLI) authenticated
- Clean working tree

## Input

Tasks can be provided as plain text descriptions, Linear issue IDs, output from `/linear-deps`, or any mix. Parse whatever the user gives you into discrete work items.

## Phase 1: Validate & Prepare

1. Parse the task list into discrete work items
2. If Linear issue IDs are provided, fetch full details (title, description, acceptance criteria) using Linear MCP tools
3. Update main:
   ```bash
   git fetch origin && git checkout main && git pull origin main
   ```
4. Check for pre-existing branches matching any task — if found, **stop immediately** and list them for the user to clean up before proceeding

## Phase 2: Overlap Analysis

Predict which files each task will touch, then group tasks by overlap.

1. **Predict files per task** — For each task, explore the codebase and list the files/modules that would need modification. Use the Agent tool with `subagent_type=Explore` to parallelize this across tasks.

2. **Build overlap matrix** — Compare predicted file lists pairwise. Count shared files between each task pair.

3. **Group tasks** using connected components from the overlap graph:
   - **Independent tasks** — zero overlap with any other task
   - **Stack groups** — tasks connected by shared files (can be multiple independent groups)

4. **Classify overlap severity** within each stack group:
   - **Small** — additive changes to 1-2 shared files (e.g., both add routes to the same file) → agents run in parallel, stack PRs after
   - **Significant** — structural changes to shared files OR 3+ overlapping files → agents run sequentially within the group

5. **Present analysis for user confirmation** before proceeding. See [REFERENCE.md](REFERENCE.md) for the presentation format.

## Phase 3: Create Worktrees

Load the `/worktrunk` skill. Create one worktree per task:

```bash
wt switch --create <branch-name>
```

All worktrees branch from the up-to-date `main`. After creating all worktrees, switch back:

```bash
wt switch main
```

Record the mapping: **task -> branch name -> worktree path**

## Phase 4: Spawn Agent Teams

Spawn agents using the Agent tool. **Never use `isolation: "worktree"`** — worktrees were already created in Phase 3.

**Execution strategy:**
- Independent tasks: all agents in parallel
- Stack groups (small overlap): all agents in the group in parallel — stack PRs after
- Stack groups (significant overlap): agents sequential within the group
- Different stack groups always run in parallel with each other

Each agent receives a prompt built from the template in [REFERENCE.md](REFERENCE.md) containing:
- The task description (and Linear issue context if applicable)
- The assigned worktree path and branch name
- Instructions to explore, implement, pass push checks, commit, and open a PR
- If a Linear issue was provided: instructions to update issue status and link the PR

Instruct each agent: **"You MUST `git add` and `git commit` all changes before marking your task complete."**

## Phase 5: Post-Completion

1. **Collect results** — branch names, PR URLs, and status from each agent
2. **Stack overlapping PRs** — For each stack group, load the `/stacked-prs` skill. Provide the branches, let it auto-order by overlap/diff size, confirm order, then execute (rebase chain + PR retargeting + stack metadata in PR bodies)
3. **Handle failures** — Report failed agents in the summary. Don't block successful tasks.

## Phase 6: Summary & Cleanup

Present the results table and list active worktrees. See [REFERENCE.md](REFERENCE.md) for the exact format.

After all PRs have been **merged**, offer to clean up worktrees:

```bash
wt remove <branch-name>
```

## Key Rules

| Rule | Detail |
|------|--------|
| **Worktrees before agents** | Create ALL worktrees via worktrunk before spawning any agents |
| **Never `isolation: "worktree"`** | The main agent owns worktree creation, not the Agent tool |
| **Pre-existing branches = stop** | Error out and list them for the user |
| **Confirm overlap analysis** | Always present grouping to user before creating worktrees |
| **Agents commit before completing** | Every agent must `git add` and `git commit` all changes |
| **Stack after parallel execution** | For small overlap, agents run in parallel, then `/stacked-prs` chains them |
| **False negatives are OK** | If independent PRs end up conflicting, handle at merge time |
| **Leave worktrees alive** | Offer cleanup only after PRs merge |
