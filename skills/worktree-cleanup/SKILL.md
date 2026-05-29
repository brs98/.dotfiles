---
name: worktree-cleanup
description: Safely audits and removes stale Git worktrees while preserving mainline and active PR worktrees. Use when the user wants to clean up worktrees, remove stale git worktrees, prune worktree metadata, or keep only open PR branches.
---

# Worktree Cleanup

## Quick start

1. Identify the repo or bare worktree manager the user wants cleaned up.
2. Inventory worktrees before deleting anything:
   ```bash
   python3 ~/.agents/skills/worktree-cleanup/scripts/cleanup-worktrees.py --repo <repo-or-worktree> --keep-open-prs
   ```
3. Present the keep/remove candidates and ask for explicit confirmation.
4. Remove clean candidates only after confirmation:
   ```bash
   python3 ~/.agents/skills/worktree-cleanup/scripts/cleanup-worktrees.py --repo <repo-or-worktree> --keep-open-prs --remove-clean --yes
   ```
5. If dirty candidates remain, list them separately. Only force-remove dirty worktrees when the user explicitly says they can be cleaned up.

## Rules

- Never delete a worktree without showing the candidate list first and getting user confirmation.
- Preserve bare repo entries automatically.
- Preserve `main`, `master`, and any branches for open PRs by default.
- Treat dirty worktrees as a second approval step. “Clean up the rest” after seeing the dirty list counts as approval to force-remove them.
- Run `git worktree prune` after removals.
- Prefer `git worktree remove` / `git worktree remove --force`; avoid raw `rm -rf` unless Git metadata is already broken and the user approved deletion.

## Workflow

### 1. Find repo managers

For nearby bare worktree managers:
```bash
find <root> -maxdepth 3 -type d -name '*.git' -print
```

For a normal worktree:
```bash
git -C <path> rev-parse --git-common-dir
```

### 2. Determine PR branches

Use GitHub CLI when available:
```bash
gh -R <owner/repo> pr list --author @me --state open --json number,headRefName,title,url
```

If `gh` is unavailable or the remote is not GitHub, ask the user which branches to keep and pass them with repeated `--keep-branch <branch>`.

### 3. Clean in phases

- Phase 1: remove clean non-kept worktrees.
- Phase 2: list dirty non-kept worktrees with status counts.
- Phase 3: force-remove dirty worktrees only after explicit approval.

## Script examples

List one repo:
```bash
python3 ~/.agents/skills/worktree-cleanup/scripts/cleanup-worktrees.py --repo /path/to/repo.git --keep-open-prs
```

Remove clean stale worktrees:
```bash
python3 ~/.agents/skills/worktree-cleanup/scripts/cleanup-worktrees.py --repo /path/to/repo.git --keep-open-prs --remove-clean --yes
```

Force-remove dirty stale worktrees after approval:
```bash
python3 ~/.agents/skills/worktree-cleanup/scripts/cleanup-worktrees.py --repo /path/to/repo.git --keep-open-prs --force-dirty --yes
```

Keep additional branches:
```bash
python3 ~/.agents/skills/worktree-cleanup/scripts/cleanup-worktrees.py --repo /path/to/repo.git --keep-branch release/next --keep-branch my/pr-branch
```
