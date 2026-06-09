# pi stow package

Personal pi configuration managed by GNU stow.

This stow package also contains an isolated Turborepo workspace rooted at
`.pi/agent`. That keeps Pi-specific validation/package tasks out of the rest of
this dotfiles repository.

## Monorepo commands

Run these from `shared/stow/pi/.pi/agent`:

```bash
pnpm install
pnpm validate
```

The root `package.json` delegates to `turbo run validate`. Package tasks live in:

- `packages/config` — validates `AGENTS.md`, `mcp.json`, and checks that local Pi runtime state is not tracked.
- `extensions` — parses each TypeScript extension with esbuild without bundling or writing output.

Turborepo/package-manager metadata is ignored by GNU stow via `shared/stow/pi/.stow-local-ignore`, so stow Pi with `--no-folding` to install the runtime files without adding monorepo files to `~/.pi/agent`. The repo `install.sh` does this automatically.

## Managed paths

Stowing `shared/stow/pi` into `$HOME` creates:

- `~/.pi/agent/AGENTS.md` — global pi instructions
- `~/.pi/agent/extensions/` — custom pi extensions
- `~/.pi/agent/mcp.json` — lazy MCP server configuration
- `~/.pi/agent/workspaces.json` — named workspace aliases for the `/repo` command

## Extensions

- `inline-skills.ts` — lets prompts reference skills inline with `/skill:<name>` and adds inline autocomplete.
- `statusline.ts` — replaces the pi footer with a compact Claude-like status line.
- `subagent/` — adds a `subagent` tool backed by isolated `pi --mode json --no-session` runs.
- `agent-team/` — adds an `agent_team` tool and `/team` command for a checkpointed interpreter → researcher → spec-writer → builder → tester → reviewer workflow with repair loops.
- `lsp.ts` — adds `lsp_diagnostics` with per-language/per-root server isolation for worktrees and subagents.
- `mcp/` — adds lazy MCP tools plus the `/mcp` command.
- `pebble-orchestrator/` — plans and burns down Pebbles-backed work with git worktrees and Pi subagents.
- `workspace-switcher.ts` — adds `/repo` to set an active workspace so relative tool paths and bash commands run from that repo.
- `imagegen.ts` — adds a `generate_image` tool that delegates to Codex CLI's hosted image generation, saving generated bitmap images to disk.
- `goal-mode.ts` — adds Codex-like `/goal` session objectives with hidden context injection, progress/budget tracking, and a `goal_update` tool.

## Agent team

`agent-team/` runs a project-agnostic team workflow with two human checkpoints:

```text
/team <task>                  # ask the coordinator to run agent_team
agent_team task=<task>        # model-facing tool
```

Flow:

```text
Interpreter
  → human alignment checkpoint
  → Researcher
  → Spec Writer
  → human build checkpoint
  → Builder
  → Tester
  → Reviewer
  → repair loops until pass, max attempts, or needs_human
```

Bundled Markdown role prompts live in `extensions/agent-team/roles/*.md`. User overrides can be placed in `~/.pi/agent/agent-team/roles/*.md`; project overrides can be placed in `.pi/agent-team/roles/*.md` and are only used when `roleScope` includes project roles. Project-local roles are repo-controlled prompts and require confirmation by default.

## Goal mode

Commands:

```text
/goal                         # create or edit the current session goal
/goal set <objective>          # set a goal and immediately start working on it
/goal edit                     # edit the objective and immediately resume work
/goal status                   # show objective, status, usage, budget, and blocker audit
/goal pause                    # pause context injection
/goal resume                   # resume and immediately continue work
/goal clear                    # clear the session goal
/goal done                     # mark complete by explicit user command
/goal budget <tokens>          # set a positive token budget
```

While a goal is active, `goal-mode.ts` injects hidden Codex-like goal context before each turn: keep the full objective intact, verify completion against current evidence, and only report a blocker after the same blocker recurs for three goal turns. The `/goal` command includes subcommand autocomplete. The model-facing `goal_update` tool can mark a goal `complete` or, after the blocker audit threshold, `blocked`; user commands control pause/resume/clear. Goals persist in the Pi session with custom `goal-state` entries and do not depend on Codex CLI or `~/.codex` state.

## Workspace switcher

Commands:

```text
/repo                    # select/show active workspace
/repo core               # use /Users/brandon/personal/ricekit.git/main
/repo community          # use /Users/brandon/personal/ricekit-community
/repo dotfiles           # use /Users/brandon/.dotfiles
/repo /absolute/path     # use an ad-hoc directory
/repo list               # list configured aliases
/repo status             # show current active workspace
/repo clear              # return to Pi launch cwd behavior
```

When a workspace is active, `workspace-switcher.ts` rewrites relative `read`, `write`, `edit`, `ls`, `grep`, and `find` paths to that workspace and prefixes `bash` commands with `cd <workspace> &&`. It also nudges `lsp_diagnostics`, `peb_plan`, and `peb_sync_github` to use the active workspace when their cwd/repo argument is omitted. Absolute paths are left unchanged.

Aliases live in `~/.pi/agent/workspaces.json` as a simple map from name to path.

## Pebble orchestrator

Primary command:

```text
/pebbles [repo] [--concurrency 3] [--auto-pr] [--dry-run] [--no-dispatch]
```

`/pebbles` is the Pebbles cockpit. It triages underdefined pebbles with the user while, unless `--dry-run` or `--no-dispatch` is set, dispatching already-ready pebbles to AFK agents in isolated git worktrees. The command understands the Pebbles state machine: `needs-triage` / `needs-info` → `ready-for-agent` → `in_progress` → `in-review` → closed by merge sync. In strict label-policy repos, it updates state labels while leaving category labels such as `bug` and `enhancement` intact.

The cockpit has three internal phases:

1. **Triage** — shows readiness gaps for pebbles labeled `needs-triage` or `needs-info`, then falls back to any non-closed, non-ready, non-review pebble so the cockpit still has useful work when nothing is dispatchable. It lets the user edit the description, add milestone comments, or move the pebble to `ready-for-agent`, `needs-info`, `ready-for-human`, or `wontfix` where those labels exist. The readiness heuristic checks for a substantive description, acceptance/done wording, verification expectations, and scope/non-goal boundaries; moving to `ready-for-agent` with gaps requires confirmation.
2. **Dispatch** — plans a parallel-safe ready batch, creates/reuses one worktree per pebble, marks selected pebbles `in_progress`, and writes a concise orchestration comment.
3. **Agent pipeline** — runs fresh-context planning, implementation, and review subagents. Review output feeds back into implementation until `APPROVED` or `--maxAttempts` is reached. `--auto-pr` pushes approved branches, opens PRs, records `peb closes add <id> --pr <url>`, and moves ready labels to `in-review` when configured. Pebbles are not closed on PR open; `peb sync github` finalizes closures after merge.

`--dry-run` performs no Pebbles, git, or subagent mutations; it prints the ready plan plus triage queue and exits without opening the interactive triage loop.

Useful single-command variants:

```text
/pebbles plan [repo] [--concurrency 3] [--state ready-for-agent]
/pebbles triage [repo] [--no-dispatch]
/pebbles run-ready [repo] [--concurrency 3]
/pebbles burn-down [repo] [--concurrency 3]       # equivalent to --auto-pr
/pebbles sync [repo] [--dry-run]
/pebbles scroll <up|down|page-up|page-down>
```

When no pebbles are ready for dispatch, `/pebbles` stays useful: it reports that no work was selected, lists triage candidates with readiness gaps, and in interactive mode prompts the user to promote, clarify, defer, or mark them for human follow-up.

While `/pebbles` is active in interactive Pi, the extension keeps a live bordered `Pebble orchestrator` swimlane card above the editor plus a footer status. The card updates once per second and on subagent JSON events, showing each selected pebble across color-coded Plan, Implement, Review, and Verdict columns, plus selected/deferred pebbles, branch, current subagent status, and latest activity. If the card overflows, scroll down/up with `ctrl+j` / `ctrl+k`; the active card intentionally captures raw `ctrl+k` before Pi's editor `ctrl+k` delete-to-line-end binding. `/pebbles scroll up` / `/pebbles scroll down`, `ctrl+shift+j` / `ctrl+shift+k`, and raw terminal `alt+↑` / `alt+↓` or `alt+k` / `alt+j` remain fallbacks.

Registered tools for agent use:

- `generate_image` — creates bitmap images by shelling out to `codex exec`, using Codex CLI's hosted image generation and subscription-backed auth, then verifies and saves the bitmap locally. Defaults to `/Users/brandon/Pictures/gpt-images/`. Requires `codex` to be installed and logged in.
- `peb_plan` — read-only execution planning.
- `peb_sync_github` — explicit `peb sync github` / `--dry-run` support.

Expected tools: `peb`, `git`, `gh` for PR steps, and `pi`. The orchestrator never runs `peb init`, never closes pebbles on PR open, and is designed to resume from Pebbles comments plus existing branches/worktrees/PRs.

Smoke check performed while adding this extension: `pi --no-extensions -e ./shared/stow/pi/.pi/agent/extensions/pebble-orchestrator/index.ts --mode json --no-session -p "/pebbles plan /Users/brandon/.dotfiles"` loaded the extension and produced a real plan from the dotfiles Pebbles workspace.

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
