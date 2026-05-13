---
name: stacked-prs
description: Manage stacked PRs — auto-order branches by diff size/overlap, create chained branches, open PRs targeting previous branch, handle merges and cascading rebases. Use when working on a workstream with multiple related PRs that touch overlapping files.
---

# Stacked PRs

## Overview

When a workstream has multiple related PRs that touch overlapping files, merging them one-at-a-time into main creates cascading merge conflicts in all remaining PRs. Stacked PRs solve this by chaining branches so each PR builds on the previous one.

**How it works:** Instead of all branches forking from main, each branch is based on the previous one. Each PR targets the branch before it, so GitHub shows only the incremental diff. After a PR merges, the next PR gets retargeted to main. No external tooling required — just plain git.

**Announce at start:** "I'm using the stacked-prs skill to [create/update/rebase] a branch stack."

### When to use

- Multiple related PRs in the same workstream that touch overlapping files
- A large change that's easier to review as a series of smaller, ordered diffs
- Rename/restructure workstreams where each step builds on the previous

### When NOT to use

- Independent PRs that don't share files — just merge them separately
- Single PRs — no stack needed

## Required Parameters

Before starting, confirm you have (ask if missing):

| Parameter | Example | Notes |
|-----------|---------|-------|
| `BRANCHES` | `rename-api, rename-ui, rename-admin` | Ordered or unordered list of branches |
| `BASE` | `main` | Base branch the stack builds on (default: `main`) |
| `PR_INFO` | Titles, descriptions, or Linear ticket refs | Optional — can be auto-generated from commit messages |

## Auto-Ordering

When the user provides branches **without a specific order**, analyze their diffs to propose an optimal stacking order.

### Step 1: Gather Diff Stats

For each branch, collect modified files and line counts:

```bash
# For each branch in the list
git diff --stat main...<branch> --name-only   # file list
git diff --stat main...<branch> | tail -1      # summary line (files changed, insertions, deletions)
```

Parse into a structure per branch:
- `files`: set of modified file paths
- `lines_changed`: total insertions + deletions

### Step 2: Build Overlap Matrix

For each pair of branches, compute overlap score:

```bash
# Get files for branch A and B, then count intersection
comm -12 <(git diff --name-only main...branchA | sort) <(git diff --name-only main...branchB | sort) | wc -l
```

### Step 3: Determine Order

Apply greedy nearest-neighbor heuristic:

1. **Sort candidates by `lines_changed` ascending** — smaller diffs first
2. **Pick the smallest diff as position 1** — this minimizes rebase surface for everything downstream
3. **For each subsequent position**, from remaining candidates pick the branch with the highest overlap score with the branch just placed — this groups related changes adjacent to minimize cross-branch conflicts
4. **Tie-break**: fewer `lines_changed` wins

### Step 4: Present for Confirmation

Show the proposed order with rationale:

```
Proposed stack order (bottom → top):

  1. rename-api       (142 lines, 8 files)  — smallest diff, foundation
  2. rename-ui        (287 lines, 12 files) — 6 files overlap with #1
  3. rename-admin     (534 lines, 23 files) — 9 files overlap with #2

Proceed with this order? (Or provide a custom order)
```

**Always confirm before proceeding.** The user may have domain knowledge that overrides the heuristic.

## Creating a Stack

Once the order is confirmed, create the stack by rebasing each branch onto the previous.

### Step 1: Ensure Branches Are Up to Date

```bash
git fetch origin
git checkout main
git pull origin main
```

### Step 2: Rebase Each Branch onto the Previous

Process branches in stack order (1, 2, 3, ...):

```bash
# Branch 1: rebase onto BASE
git checkout <branch-1>
git rebase main

# Branch 2: rebase onto branch-1
git checkout <branch-2>
git rebase <branch-1>

# Branch 3: rebase onto branch-2
git checkout <branch-3>
git rebase <branch-2>

# ... and so on
```

**If conflicts arise during rebase:**
1. Stop and report the conflict to the user
2. Show which files conflict and the nature of the conflict
3. Offer to help resolve, or let the user resolve manually
4. After resolution: `git rebase --continue`

### Step 3: Force-Push All Branches

After rebasing, each branch has rewritten history and needs force-push:

```bash
git push --force-with-lease origin <branch-1>
git push --force-with-lease origin <branch-2>
git push --force-with-lease origin <branch-3>
```

**Always use `--force-with-lease`**, never `--force`. This prevents overwriting someone else's push.

## Opening PRs

Create a PR for each branch in the stack. Each PR targets the **previous branch** (except the first, which targets `BASE`).

### PR Body Template

Each PR body should include a stack metadata section at the top:

```markdown
## Stack

This PR is part of a stacked series. **Review only the incremental diff** — earlier changes are in previous PRs.

| Position | Branch | PR | Status |
|----------|--------|----|--------|
| 1 | `<branch-1>` | #<pr-1> | <status> |
| 2 | `<branch-2>` | **#<pr-2> ← you are here** | <status> |
| 3 | `<branch-3>` | #<pr-3> | <status> |

**Base:** `<target-branch>` ← merge into this

---

<actual PR description here>
```

### Creating the PRs

```bash
# PR 1: targets BASE (main)
gh pr create --base main --head <branch-1> \
  --title "<title-1>" --body "$(cat <<'EOF'
<body with stack table>
EOF
)"

# PR 2: targets branch-1
gh pr create --base <branch-1> --head <branch-2> \
  --title "<title-2>" --body "$(cat <<'EOF'
<body with stack table>
EOF
)"

# PR 3: targets branch-2
gh pr create --base <branch-2> --head <branch-3> \
  --title "<title-3>" --body "$(cat <<'EOF'
<body with stack table>
EOF
)"
```

After all PRs are created, go back and **update each PR body** with the actual PR numbers and links:

```bash
gh pr edit <pr-number> --body "$(cat <<'EOF'
<updated body with real PR numbers>
EOF
)"
```

## Merge Flow

Merge from the **top of the stack downward** using squash merges. Each PR squash-merges into its parent branch. No conflicts, no rebasing, minimal CI.

```bash
# Merge leaf PR into its parent branch (squash)
gh pr merge <pr-N> --squash        # merges into branch N-1
gh pr merge <pr-N-1> --squash      # merges into branch N-2
# ... continue up the stack ...
gh pr merge <pr-2> --squash        # merges into branch 1 (which targets main)
# Final merge: user merges PR #1 into main
```

**Why it works:** Each squash merge commits onto the parent branch. The next PR up the chain just sees a larger diff — the base branch never changes out from under it. No conflicts arise because no base branch is modified out from under an open PR.

**Trade-off:** All changes accumulate into the final PR. The last squash merge into main contains all changes from the entire stack in one commit.

**Important:** Always leave the final merge (into main) for the user to do manually.

## Updating the Stack

When changes are made to an earlier branch (e.g., review feedback on PR #1), all downstream branches need cascading rebase.

### Cascading Rebase

```bash
# After updating branch-1 with new commits
git checkout <branch-1>
# ... make changes, commit ...
git push --force-with-lease origin <branch-1>

# Cascade: rebase branch-2 onto updated branch-1
git checkout <branch-2>
git rebase <branch-1>
git push --force-with-lease origin <branch-2>

# Cascade: rebase branch-3 onto updated branch-2
git checkout <branch-3>
git rebase <branch-2>
git push --force-with-lease origin <branch-3>

# ... continue for all downstream branches
```

**Automate the cascade:** Process all branches from the updated one to the top of the stack. Do not skip intermediate branches.

### When to Cascade

- After addressing review feedback on any branch except the top
- After resolving merge conflicts in any branch
- After the user makes manual commits on any branch

## Rebasing onto Main

When main moves (e.g., other PRs merge), the entire stack may need rebasing.

### Full Stack Rebase

```bash
git fetch origin
git checkout main
git pull origin main

# Rebase the bottom branch onto updated main
git checkout <branch-1>
git rebase main
git push --force-with-lease origin <branch-1>

# Cascade rebase through the rest of the stack
git checkout <branch-2>
git rebase <branch-1>
git push --force-with-lease origin <branch-2>

git checkout <branch-3>
git rebase <branch-2>
git push --force-with-lease origin <branch-3>
```

### When to Rebase onto Main

- Before merging the first PR (to ensure clean merge)
- When main has diverged significantly and conflicts are likely
- When the user explicitly requests it
- **Do NOT auto-rebase onto main** — only when asked or before merge

## Key Gotchas

| Gotcha | Detail |
|--------|--------|
| **`--force-with-lease` vs `--force`** | Use `--force-with-lease` for shared branches. For personal branches after a rebase, `--force-with-lease` may be rejected (stale tracking info) — `--force` is acceptable. If `--force-with-lease` fails, fetch first and verify no unexpected changes before falling back to `--force` |
| **Lockfile regeneration** | After rebase, `pnpm-lock.yaml` may have conflicts. Resolve by running `pnpm install` and committing the updated lockfile |
| **Worktree considerations** | If using worktrees for parallel work, each worktree has its own working tree. Rebase operations should be done in the main worktree or a dedicated one. When creating worktrees inside a loop, always use absolute paths — relative paths resolve against the CWD which may be a different worktree |
| **CI cost varies by strategy** | Bottom-up squash is O(n²) CI runs (cascade force-pushes re-trigger CI on all remaining PRs). Top-down squash and merge-commit strategies are O(n). For large stacks, prefer top-down squash or merge commits |
| **PR diff after retarget** | After retargeting a PR from branch-N to main, the diff may temporarily show all cumulative changes. GitHub updates within seconds |
| **Merge strategy matters for conflicts** | Squash merge creates new SHAs that cause downstream conflicts. Merge commits preserve original SHAs so git can skip already-applied commits during rebase. Top-down squash avoids the problem entirely by merging into parent branches instead of main |
| **Review after cascade** | After a cascading rebase, re-request reviews on PRs whose diff changed materially |
| **Stack table maintenance** | Update the stack table in ALL PR bodies after each merge or retarget. Use `gh pr edit` to batch-update |
| **Don't rebase published shared branches** | If other people are working on a branch in the stack, coordinate before force-pushing. Prefer this workflow for solo workstreams |
| **`git mv` + pnpm pitfall** | When moving packages with `git mv`, `pnpm install` may create workspace link artifacts at the target path. Always `rm -rf "$NEW_DIR"` before `git mv` to prevent nested directories (e.g., `packages/orders/ui/ui/`) |

## Quick Reference

```bash
# === Auto-ordering ===
# Get diff stats for a branch
git diff --stat main...<branch> | tail -1
git diff --name-only main...<branch>

# File overlap between two branches
comm -12 <(git diff --name-only main...branchA | sort) \
         <(git diff --name-only main...branchB | sort) | wc -l

# === Creating the stack ===
# Rebase branch onto its parent in the stack
git checkout <branch>
git rebase <parent-branch>
git push --force-with-lease origin <branch>

# === Opening PRs ===
# Create PR targeting previous branch
gh pr create --base <previous-branch> --head <branch> \
  --title "Title" --body "Body"

# === Merge flow ===
# Retarget next PR to main after merging
gh pr edit <pr-number> --base main

# === Cascading rebase ===
# After updating branch-N, rebase all downstream
for branch in <branch-N+1> <branch-N+2> ...; do
  git checkout "$branch"
  git rebase "$(git log --oneline --decorate | head -1)"  # conceptual
done
# In practice: rebase each onto its predecessor explicitly

# === Full stack rebase onto main ===
git fetch origin && git checkout main && git pull origin main
git checkout <branch-1> && git rebase main && git push --force-with-lease origin <branch-1>
git checkout <branch-2> && git rebase <branch-1> && git push --force-with-lease origin <branch-2>
# ... continue for all branches

# === Update all PR bodies ===
gh pr edit <pr-number> --body "$(cat <<'EOF'
<updated body>
EOF
)"
```
