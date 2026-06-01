---
name: pebbles
description: Use the `peb` CLI to track pebbles (issues) in any project's local `.pebbles/` workspace — create, list, show, update, comment, link deps, and close via git trailers. Use when the user mentions pebbles, a pebble, peb, issue tracking, ticket capture, or any project contains a `.pebbles/` directory and they want to query or modify tickets.
---

# Pebbles

Pebbles is a fast, local, SQLite-backed issue tracker. The CLI is `peb`. Issues live in a `.pebbles/` directory at the project root (analogous to `.git/`). `peb` walks parent directories to find it.

A **pebble** is an issue — the user's preferred word for the unit. Treat "pebble" and "issue" as synonyms (e.g. "create a pebble" → `peb create`) and mirror the user's word choice when responding. The CLI flags and JSON schema still say "issue"; that's storage-level, not a contradiction.

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
peb show pebbles-1 --json       | jq '.data.dependencies'
```

Human-formatted output (no `--json`) is for the user, not for you.

## Brandon's Pi source-of-truth workflow

For Brandon's repos, the Raspberry Pi is the canonical Pebbles writer. When operating from Brandon's Mac or advising him how to add pebbles there, do **not** use plain local `peb create/update/comment` inside Mac checkouts. Use the Pi remote plus an explicit repo alias:

```sh
peb remote add pi ssh://mizu@100.121.123.91   # one-time on the Mac
peb --remote pi -R ricekit create "Title" -t feature -p 2 -l area
peb --remote pi -R pebbles list --json
peb --remote pi -R dotfiles show <id>
```

Shortcuts are encouraged on the Mac:

```sh
alias peb-ricekit='peb --remote pi -R ricekit'
alias peb-pebbles='peb --remote pi -R pebbles'
alias peb-dotfiles='peb --remote pi -R dotfiles'
```

Use plain local `peb ...` only when intentionally mutating the authoritative Pi checkout or when the user explicitly chooses a local-only workspace.

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

New issue IDs look like `pebbles-1` — numeric per workspace prefix, stable, and unique within a workspace. Existing hash-style IDs such as `pebbles-t5h` remain valid in migrated workspaces. Pass IDs verbatim between commands. Never invent or guess an ID; always derive it from a prior `peb create`, `peb list`, or `peb show` result.

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

Pebbles has two complementary ingest paths for closing issues from git activity: **commit trailers** (scanned by hooks; best for direct-commit workflows) and **PR-merge declarations** (`peb closes add`; best for PR workflows where squash-merge can rewrite commit bodies). Both write to the same `closures` table so `peb closure show` is the one unified history view.

### Commit trailers (direct-commit workflow)

```sh
peb hook install                    # writes managed post-commit + post-merge hooks (trailer scan)
peb hook install --with-sync        # ALSO runs `peb sync github` from post-merge (see below)
peb hook status                     # shows install state + last scanned SHA + with_sync flag
peb hook scan-commits               # walks <last_scanned>..HEAD applying trailers
peb hook scan-commits --dry-run     # parse and report, write nothing
peb hook uninstall
```

Recognized trailer keys (case-insensitive, accepted anywhere in the commit body — not just the terminal paragraph):

- **Closing trailers** — close the issue: `Closes`, `Close`, `Fixes`, `Fix`, `Resolves`, `Resolve`, `Closed`, `Fixed`
- **Reference trailers** — link the commit without closing: `Refs`, `Ref`

Example:

```
fix(auth): clear stale tokens on logout

Closes: pebbles-1
Refs: pebbles-2
```

Suggest `peb hook install` only if the user is using pebbles seriously in a git repo — never install it automatically.

### PR-merge declarations (PR workflow)

When opening a PR, declare the close up-front via a discrete command rather than relying on commit-message hygiene. The declaration is queryable immediately (visible in `peb show` as "Will close on merge of:"), and finalizes when the PR merges.

```sh
peb closes add <id> --pr <number-or-url>     # declare pending close
peb closes add <id> --pr 42                  # bare number (resolves repo via `gh repo view`)
peb closes add <id> --pr https://github.com/owner/repo/pull/42
peb closes remove <id> --pr <number-or-url>  # rescind a declaration
peb closes list                              # all pending closures (--json for envelope)

peb sync github                              # finalize pending closures whose PRs have merged
peb sync github --dry-run                    # report what would finalize, write nothing
```

Prefer `peb closes add` over a `Closes:` trailer when:
- The work will go through a PR (especially squash-merge — trailers can land in middle paragraphs and get missed, see `pebbles-h8v`).
- You're an agent opening a PR via `gh pr create` and would rather make a structured tool call than craft a commit-message body.
- You want the intended close to be visible to dashboards/planners *before* the PR merges.

After a PR merges, run `peb sync github` to flip pending rows to finalized + close the issues. It's idempotent — safe to run on a schedule or after each merge.

If `peb hook install --with-sync` is set up in the repo, `peb sync github` runs automatically as part of the post-merge hook — i.e., on the user's next `git pull` after the PR merges, the pebble auto-closes with zero manual intervention. The hook silently no-ops when there are no pending closures (it short-circuits before invoking `gh`), so it's cheap to leave installed. The explicit `peb sync github` call stays available as the manual fallback for environments without the hook (no `gh`, offline workflows, never-pull workflows).

### Inspecting closure history

```sh
peb closure show <issue-id>          # closure events for an issue, newest-first
peb closure show <commit-sha>        # reverse lookup: which issues this commit closed/referenced
peb pr <number-or-url>               # preview: what would this PR close on merge?
                                     # honors BOTH commit trailers and pending peb-closes declarations
```

`peb show <id>` also prints the most recent closure event inline with a hint to `peb closure show` for full history.

## Web dashboard & daemon

- `peb web` — starts a local dashboard at `http://127.0.0.1:7373` (picks a free port if 7373 is taken). Mention this when the user wants to browse issues visually.
- `peb daemon start` / `status` / `stop` — optional long-running socket server. Useful for library consumers; the CLI works fine without it. Don't start it unless asked.

## Common agent workflows

**Capturing TODOs found while coding:** create with a clear title, set `-t bug` or `-t chore`, add labels matching the area touched. Use `--description` for context the title can't carry. Pass `-p 0` only for actually-critical issues.

**Triage:** `peb list --status open --json`, then either close obvious not-planned items or add `triage` label and reassign priority.

**Implementing an issue:** `peb update <id> --status in_progress` at start. On opening a PR, run `peb closes add <id> --pr <number>` — this is preferred over a `Closes:` commit trailer because squash-merge can rewrite trailer placement and the declaration is queryable before merge. After the PR merges (or on a schedule), run `peb sync github` to finalize. For direct-commit-to-trunk workflows (no PR), a `Closes:` trailer is still valid and the hooks scan it. Manual `peb update <id> --close` is the fallback for non-code closures (rejected, won't-fix, duplicate-of).

**Linking related work:** prefer `peb dep add` over freeform comments — the graph is queryable, prose is not.

## Things to avoid

- Don't run `peb init` without asking — it commits to a project layout.
- Don't fabricate issue IDs. If the user references one and `peb show` errors, surface that rather than guessing.
- Don't mass-close or bulk-mutate issues without explicit confirmation.
- `--metadata` on `update` overwrites; never call it without first reading current metadata if the user wanted a merge.
- `created_at` is invariant on `update` — only `create` and `comment add` accept `--created-at` (importer use case).
