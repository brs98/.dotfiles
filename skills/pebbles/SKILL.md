---
name: pebbles
description: Use the `peb` CLI to track issues in any project's local `.pebbles/` workspace — create, list, show, update, comment, link deps, and close via git trailers. Use when the user mentions pebbles, peb, issue tracking, ticket capture, or any project contains a `.pebbles/` directory and they want to query or modify tickets.
---

# Pebbles

Pebbles is a fast, local, SQLite-backed issue tracker. The CLI is `peb`. Issues live in a `.pebbles/` directory at the project root (analogous to `.git/`). `peb` walks parent directories to find it.

## Detect the workspace first

Before doing anything else, confirm pebbles is set up in the current project:

```sh
peb where            # prints the workspace root, or errors if none found
```

- If it errors with "no workspace found" → ask the user before running `peb init` (it creates `.pebbles/db.sqlite` at the current directory). Don't init silently.
- If `peb` itself is missing → tell the user; do not try to install it.

## Always pass `--json` for programmatic use

Every command supports `--json`. Use it whenever you need to parse the result. The envelope is `{"data": ..., "schema_version": 1}` — read `.data`.

```sh
peb list --status open --json | jq '.data[] | {id, title, priority}'
peb show pebbles-abc --json     | jq '.data.dependencies'
```

Human-formatted output (no `--json`) is for the user, not for you.

## Core workflow

```sh
# Capture
peb create "Fix login redirect" -p 1 -t bug -l auth,regression

# Discover
peb list                                       # all open + in_progress
peb list --status open --priority 1 --json
peb list --label auth --assignee brandon
peb list --has-metadata-key gh_issue_number    # filter by metadata presence

# Inspect (includes deps + comments)
peb show <id>
peb show <id> --json

# Mutate
peb update <id> --status in_progress
peb update <id> --add-label needs-design --remove-label triage
peb update <id> --assignee alice
peb update <id> --close                        # default reason: completed
peb update <id> --close --reason not_planned
peb update <id> --close --duplicate-of <other-id>   # implies --reason duplicate, creates dep edge
peb update <id> --reopen
```

### Issue IDs

IDs look like `pebbles-t5h` — hash-style, stable, globally unique within a workspace. Pass them verbatim between commands. Never invent or guess an ID; always derive it from a prior `peb create`, `peb list`, or `peb show` result.

### Field reference

- `--type`: free-form; conventional values are `feature`, `bug`, `chore`, `decision`. Default `feature`.
- `--priority`: integer 0–4, **0 = critical**, 4 = lowest. Default `2`.
- `--status`: free-form text; conventional values are `open`, `in_progress`, `closed`. `--close`/`--reopen` are shortcuts.
- `--reason` (with `--close`): one of `completed` | `not_planned` | `duplicate`.
- `--labels` / `--add-label` / `--remove-label`: free-form strings. On `create` use `--labels foo,bar`. On `update` use repeatable `--add-label x --remove-label y`.
- `--metadata`: arbitrary JSON object. On `update` it **replaces wholesale** — to merge, read with `peb show --json`, modify, and write back.
- `--parent <id>`: parent-child hierarchy (separate from dep edges).
- `--assignee ''` / `--author ''`: pass empty string to clear those fields.

## Dependencies (the graph)

Edges go **child depends on parent**:

```sh
peb dep add <child> <parent>                    # default type: blocks
peb dep add <child> <parent> -t relates
peb dep add <child> <parent> -t parent          # alternative to --parent on create
peb dep remove <child> <parent>
peb dep list <id>                               # all edges incident to <id>
peb dep list <id> -t blocks
```

Edge types: `blocks` (default), `duplicates`, `parent`, `relates`, `closes`.

## Comments

```sh
peb comment add <id> "Body of the comment"
peb comment add <id> - < notes.md               # read body from stdin
peb comment add <id> "..." --author alice
peb comment list <id>
peb comment edit <comment-id> "new body"
peb comment delete <comment-id>
```

`peb show <id>` already includes the full comment thread, so reach for `comment list` only if you specifically want comments alone.

## Git integration

Close issues from commit messages via trailers:

```sh
peb hook install         # writes managed post-commit + post-merge hooks
peb hook status          # shows install state + last scanned SHA
peb hook scan-commits    # walks <last_scanned>..HEAD applying trailers
peb hook uninstall
```

Recognized trailers in commit messages:

- `Closes: pebbles-abc` — closes the issue
- `Fixes: pebbles-abc` — same as Closes
- `Refs: pebbles-abc` — links the commit without closing

Suggest `peb hook install` only if the user is using pebbles seriously in a git repo — never install it automatically.

## Web dashboard & daemon

- `peb web` — starts a local dashboard at `http://127.0.0.1:7373` (picks a free port if 7373 is taken). Mention this when the user wants to browse issues visually.
- `peb daemon start` / `status` / `stop` — optional long-running socket server. Useful for library consumers; the CLI works fine without it. Don't start it unless asked.

## Common agent workflows

**Capturing TODOs found while coding:** create with a clear title, set `-t bug` or `-t chore`, add labels matching the area touched. Use `--description` for context the title can't carry. Pass `-p 0` only for actually-critical issues.

**Triage:** `peb list --status open --json`, then either close obvious not-planned items or add `triage` label and reassign priority.

**Implementing an issue:** `peb update <id> --status in_progress` at start; on completion, either close manually with `peb update <id> --close` or land a commit with `Closes: <id>` if hooks are installed.

**Linking related work:** prefer `peb dep add` over freeform comments — the graph is queryable, prose is not.

## Things to avoid

- Don't run `peb init` without asking — it commits to a project layout.
- Don't fabricate issue IDs. If the user references one and `peb show` errors, surface that rather than guessing.
- Don't mass-close or bulk-mutate issues without explicit confirmation.
- `--metadata` on `update` overwrites; never call it without first reading current metadata if the user wanted a merge.
- `created_at` is invariant on `update` — only `create` and `comment add` accept `--created-at` (importer use case).
