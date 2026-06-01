---
name: patchtree
description: Use Patchtree workspace primitives to create cheap isolated native workspaces for repository tasks without orchestrating agents. Use when an agent needs a safe per-task workspace, parallel repo work, APFS CoW/reflink workspaces, workspace diff/export/delete/cleanup, or machine-readable workspace status.
---

# Patchtree

## Purpose

Use `patchtree` as a primitive workspace layer: cheap isolated directories, command execution, status, diff, export, delete, and cleanup. Do not add scheduling, queues, task assignment, or agent orchestration. Agents/scripts are only consumers of the primitives.

## Quick start

Create a control directory outside the base repo, then fork one workspace per task:

```bash
mkdir -p ~/workspaces/<project-name>
cd ~/workspaces/<project-name>
patchtree init /path/to/base-repo
patchtree fork <task-name>
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
- Prefer `patchtree path --json`, `patchtree status --json`, `patchtree inspect --json`, and `patchtree list --json` for machine-readable state.
- Use `patchtree run` for commands that should be recorded as workspace evidence.
- Use `patchtree diff` or `patchtree export --patch` to hand changes back to the caller.
- Use `patchtree delete --force` only after needed changes are exported or intentionally discarded.
- Use `patchtree cleanup` as a dry run first; use `patchtree cleanup --apply` only for stale/orphaned `.workspace-state` files.
- Never build agent orchestration on top of this skill: no queues, schedulers, worker pools, assignment logic, or PR automation unless the user explicitly asks outside this skill.

## Backend behavior

On macOS, `patchtree fork` defaults to APFS copy-on-write cloning for low incremental storage across many parallel workspaces. This may fork slower than Git worktrees, but unchanged file blocks are shared.

Useful overrides:

```bash
WS_MATERIALIZATION_POLICY=reflink patchtree fork <task-name>
WS_MATERIALIZATION_POLICY=worktree patchtree fork <task-name>
```

Use `reflink` when storage sharing is the priority. Use `worktree` when fork latency is more important.

## Common workflows

Start a task:

```bash
cd ~/workspaces/<project-name>
patchtree fork <task-name>
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
