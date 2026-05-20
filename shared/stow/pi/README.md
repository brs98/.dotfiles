# pi stow package

Personal pi configuration managed by GNU stow.

## Managed paths

Stowing `shared/stow/pi` into `$HOME` creates:

- `~/.pi/agent/AGENTS.md` — global pi instructions
- `~/.pi/agent/extensions/` — custom pi extensions
- `~/.pi/agent/mcp.json` — lazy MCP server configuration

## Extensions

- `inline-skills.ts` — lets prompts reference skills inline with `/skill:<name>` and adds inline autocomplete.
- `statusline.ts` — replaces the pi footer with a compact Claude-like status line.
- `subagent.ts` — adds a `subagent` tool backed by isolated `pi --mode json --no-session` runs.
- `lsp.ts` — adds `lsp_diagnostics` with per-language/per-root server isolation for worktrees and subagents.
- `mcp.ts` — adds lazy MCP tools plus the `/mcp` command.
- `pebble-orchestrator.ts` — plans and burns down Pebbles-backed work with git worktrees and Pi subagents.

## Pebble orchestrator

Commands:

```text
/peb-plan [repo] [--concurrency 3] [--state ready-for-agent]
/peb-run-ready [repo] [--concurrency 3] [--maxAttempts 3] [--model vercel-ai-gateway/moonshotai/kimi-k2.6]
/peb-burn-down [repo] [--concurrency 3] [--maxAttempts 3] [--model vercel-ai-gateway/moonshotai/kimi-k2.6]
/peb-sync [repo] [--dry-run]
```

`/peb-plan` is read-only: it runs `peb where`, reads `peb config label-policy show --json`, lists open ready pebbles, filters existing PRs, reuses existing orchestrator branches/worktrees when present, checks dependency metadata, and emits a parallel-safe batch. It prefers the `ready-for-agent` state label and `in-review` review label when the repo policy defines them.

`/peb-run-ready` creates one git worktree per selected pebble, marks each pebble `in_progress`, comments with run metadata, then runs implementer/reviewer subagents. If review returns `CHANGES_REQUESTED`, the implementer receives the reviewer feedback and retries until `APPROVED` or `--maxAttempts` is reached. It leaves approved branches ready for humans to push/open PRs.

`/peb-burn-down` does the same implementation/review feedback loop, then pushes approved branches, opens GitHub PRs with `gh pr create`, records `peb closes add <id> --pr <url>`, and moves `ready-for-agent` to `in-review` when those labels exist. Pebbles remain `in_progress` until `peb sync github` closes them after merge.

While `/peb-run-ready` or `/peb-burn-down` is active in interactive Pi, the extension keeps a live `Pebble orchestrator` swimlane widget above the editor plus a footer status. The widget updates once per second and on subagent JSON events, showing each selected pebble across Plan, Implement, Review, and Verdict columns, plus stage, elapsed time, selected/deferred pebbles, branch, current implementer/reviewer status, and latest subagent activity.

Registered tools for agent use:

- `peb_plan` — read-only execution planning.
- `peb_sync_github` — explicit `peb sync github` / `--dry-run` support.

Expected tools: `peb`, `git`, `gh` for PR steps, and `pi`. The orchestrator never runs `peb init`, never closes pebbles on PR open, and is designed to resume from Pebbles comments plus existing branches/worktrees/PRs.

Smoke check performed while adding this extension: `pi --no-extensions -e ./shared/stow/pi/.pi/agent/extensions/pebble-orchestrator.ts --mode json --no-session -p "/peb-plan /Users/brandon/.dotfiles"` loaded the extension and produced a real plan from the dotfiles Pebbles workspace.

## MCP command

Examples:

```text
/mcp list
/mcp tools context7
/mcp call context7 resolve-library-id {"libraryName":"react","query":"react hooks"}
/mcp stop all
```

## Not managed here

The following remain local-machine state and are intentionally not stowed:

- `~/.pi/agent/auth.json`
- `~/.pi/agent/settings.json`
- `~/.pi/agent/sessions/`
- `~/.pi/agent/skills/`
- `~/.pi/agent/themes/`
