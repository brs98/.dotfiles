---
name: cheap-workspaces
description: Use local `ws` workspace primitives to create cheap isolated native workspaces for repository tasks without orchestrating agents. Use when an agent needs a safe per-task workspace, parallel repo work, APFS CoW/reflink workspaces, workspace diff/export/delete/cleanup, or machine-readable workspace status.
---

# Cheap Workspaces

## Purpose

Use `ws` as a primitive workspace layer: cheap isolated directories, command execution, status, diff, export, delete, and cleanup. Do not add scheduling, queues, task assignment, or agent orchestration. Agents/scripts are only consumers of the primitives.

## Quick start

Create a control directory outside the base repo, then fork one workspace per task:

```bash
mkdir -p ~/workspaces/<project-name>
cd ~/workspaces/<project-name>
ws init /path/to/base-repo
ws fork <task-name>
ws path --json <task-name>
```

Run, inspect, export, and clean up:

```bash
ws run <task-name> -- <command...>
ws run --kind test --label "unit tests" <task-name> -- npm test
ws status --json <task-name>
ws diff <task-name>
ws export <task-name> --patch /tmp/<task-name>.patch
ws delete <task-name> --force
ws cleanup
ws cleanup --apply
```

## Rules for agents

- Use one `ws` workspace per independent task.
- Do not mutate the base repo directly.
- Prefer `ws path --json`, `ws status --json`, `ws inspect --json`, and `ws list --json` for machine-readable state.
- Use `ws run` for commands that should be recorded as workspace evidence.
- Use `ws diff` or `ws export --patch` to hand changes back to the caller.
- Use `ws delete --force` only after needed changes are exported or intentionally discarded.
- Use `ws cleanup` as a dry run first; use `ws cleanup --apply` only for stale/orphaned `.workspace-state` files.
- Never build agent orchestration on top of this skill: no queues, schedulers, worker pools, assignment logic, or PR automation unless the user explicitly asks outside this skill.

## Backend behavior

On macOS, `ws fork` defaults to APFS copy-on-write cloning for low incremental storage across many parallel workspaces. This may fork slower than Git worktrees, but unchanged file blocks are shared.

Useful overrides:

```bash
WS_MATERIALIZATION_POLICY=reflink ws fork <task-name>
WS_MATERIALIZATION_POLICY=worktree ws fork <task-name>
```

Use `reflink` when storage sharing is the priority. Use `worktree` when fork latency is more important.

## Common workflows

Start a task:

```bash
cd ~/workspaces/<project-name>
ws fork <task-name>
workspace_path=$(ws path <task-name>)
```

Export a patch or branch:

```bash
ws export <task-name> --patch /tmp/<task-name>.patch
ws export <task-name> --branch workspace/<task-name>
```

Compare attempts:

```bash
ws compare <task-a> <task-b>
```

## Troubleshooting

If a command says the workspace is locked, another mutation operation is active or a stale lock exists:

```bash
ws cleanup
ws cleanup --apply
```

If `ws` is unavailable, install it from the prototype repo:

```bash
cd ~/personal/workspace-state-prototype
./scripts/install.sh
```
