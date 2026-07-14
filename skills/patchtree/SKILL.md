---
name: patchtree
description: Use Patchtree as the lifecycle and control layer for isolated repository workspaces, backed by Git worktrees by default and APFS CoW/reflink copies when explicitly useful. Use when an agent needs a safe per-task workspace, parallel repo work, workspace diff/export/delete/cleanup, or machine-readable workspace status.
---

# Patchtree

## Purpose

Use `patchtree` as the lifecycle and control layer for isolated task workspaces: creation, naming, command evidence, status, diff, export, deletion, and cleanup. Use Git worktree materialization by default so Patchtree's workflow primitives sit on top of Git's mature isolation mechanism.

Patchtree owns every workspace it creates. Run normal Git commands inside the workspace as needed, but use Patchtree to create, locate, export, and delete it. Do not independently manage a Patchtree-owned workspace with `git worktree add`, `git worktree move`, `git worktree remove`, or `git worktree prune`; doing so can make Patchtree's metadata drift from Git's worktree state.

Do not add scheduling, queues, task assignment, or agent orchestration. Agents/scripts are only consumers of the primitives.

## Quick start

Create a control directory outside the base repo, then fork one workspace per task:

```bash
mkdir -p ~/workspaces/<project-name>
cd ~/workspaces/<project-name>
patchtree init /path/to/base-repo
WS_MATERIALIZATION_POLICY=worktree patchtree fork <task-name>
patchtree path --json <task-name>
```

Run, inspect, export, and clean up:

```bash
patchtree run <task-name> -- <command...>
patchtree run --kind test --label "unit tests" <task-name> -- npm test
patchtree status --json <task-name>
patchtree diff <task-name>
patchtree export <task-name> --patch /tmp/<task-name>.patch
patchtree delete <task-name> --force
patchtree cleanup
patchtree cleanup --apply
```

## Rules for agents

- Use one `patchtree` workspace per independent task.
- Do not mutate the base repo directly.
- Use `WS_MATERIALIZATION_POLICY=worktree` for agent tasks unless the reflink exception below clearly applies.
- Let Patchtree own the lifecycle of Patchtree-created worktrees. Normal Git commands inside the workspace are fine; direct `git worktree` lifecycle commands for that workspace are not.
- Prefer `patchtree path --json`, `patchtree status --json`, `patchtree inspect --json`, and `patchtree list --json` for machine-readable state.
- Use `patchtree run` for commands that should be recorded as workspace evidence.
- Use `patchtree diff` or `patchtree export --patch` to hand changes back to the caller.
- Use `patchtree delete --force` only after needed changes are exported or intentionally discarded.
- Use `patchtree cleanup` as a dry run first; use `patchtree cleanup --apply` only for stale/orphaned `.workspace-state` files.
- Never build agent orchestration on top of this skill: no queues, schedulers, worker pools, assignment logic, or PR automation unless the user explicitly asks outside this skill.

## Backend behavior

Patchtree supports Git worktree and reflink materialization. Although the current macOS implementation defaults to APFS reflink copies, agents should explicitly select Git worktrees for routine tasks:

```bash
WS_MATERIALIZATION_POLICY=worktree patchtree fork <task-name>
```

This combines Patchtree's control layer with fast, clean workspaces projected from `HEAD` and Git's shared object database. Base-repository dirtiness and ignored files do not bleed into the workspace.

Use reflink materialization only when carrying a large ready-to-use working tree, such as installed dependencies, materially saves setup time:

```bash
WS_MATERIALIZATION_POLICY=reflink patchtree fork <task-name>
```

On APFS, unchanged file blocks are shared, but creating filesystem metadata may still be slower than a Git worktree. Reflink copies include the full working tree, including ignored files such as dependency directories, caches, and local `.env` files. Check that carrying those files is intentional. Without `--allow-dirty`, Patchtree falls back to a Git worktree when it detects tracked or non-ignored untracked changes. Do not use `--allow-dirty` unless the user explicitly wants the base working tree copied as-is.

Use native `git worktree` directly instead of Patchtree for long-lived human-managed branches when Patchtree's task metadata, evidence, export, and cleanup features are unnecessary.

## Common workflows

Start a task:

```bash
cd ~/workspaces/<project-name>
WS_MATERIALIZATION_POLICY=worktree patchtree fork <task-name>
workspace_path=$(patchtree path <task-name>)
```

Export a patch or branch:

```bash
patchtree export <task-name> --patch /tmp/<task-name>.patch
patchtree export <task-name> --branch workspace/<task-name>
```

Compare attempts:

```bash
patchtree compare <task-a> <task-b>
```

## Troubleshooting

If a command says the workspace is locked, another mutation operation is active or a stale lock exists:

```bash
patchtree cleanup
patchtree cleanup --apply
```

If `patchtree` is unavailable, install it from the prototype repo:

```bash
cd ~/personal/workspace-state-prototype
./scripts/install.sh
```
