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
- `subagent.ts` — adds a `subagent` tool backed by isolated `pi --mode json --no-session` runs.
- `lsp.ts` — adds `lsp_diagnostics` with per-language/per-root server isolation for worktrees and subagents.
- `mcp.ts` — adds lazy MCP tools plus the `/mcp` command.
- `pebble-orchestrator.ts` — plans and burns down Pebbles-backed work with git worktrees and Pi subagents.
- `workspace-switcher.ts` — adds `/repo` to set an active workspace so relative tool paths and bash commands run from that repo.
- `imagegen.ts` — adds a `generate_image` tool that delegates to Codex CLI's hosted image generation, saving generated bitmap images to disk.

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

Commands:

```text
/peb-plan [repo] [--concurrency 3] [--state ready-for-agent]
/peb-run-ready [repo] [--concurrency 3] [--maxAttempts 3] [--uiDelayMs 0] [--model vercel-ai-gateway/moonshotai/kimi-k2.6]
/peb-burn-down [repo] [--concurrency 3] [--maxAttempts 3] [--uiDelayMs 0] [--model vercel-ai-gateway/moonshotai/kimi-k2.6]
/peb-scroll <up|down|page-up|page-down>
/peb-sync [repo] [--dry-run]
```

`/peb-plan` is read-only: it runs `peb where`, reads `peb config label-policy show --json`, lists open ready pebbles, filters existing PRs, reuses existing orchestrator branches/worktrees when present, checks dependency metadata, and emits a parallel-safe batch. It prefers the `ready-for-agent` state label and `in-review` review label when the repo policy defines them.

`/peb-run-ready` creates one git worktree per selected pebble, marks each pebble `in_progress`, comments with run metadata, then runs implementer/reviewer subagents. If review returns `CHANGES_REQUESTED`, the implementer receives the reviewer feedback and retries until `APPROVED` or `--maxAttempts` is reached. It leaves approved branches ready for humans to push/open PRs. For UI testing, `--uiDelayMs <ms>` (alias: `--delayMs`) pauses each selected pebble before implementer work so the live card is inspectable.

`/peb-burn-down` does the same implementation/review feedback loop, then pushes approved branches, opens GitHub PRs with `gh pr create`, records `peb closes add <id> --pr <url>`, and moves `ready-for-agent` to `in-review` when those labels exist. Pebbles remain `in_progress` until `peb sync github` closes them after merge.

While `/peb-run-ready` or `/peb-burn-down` is active in interactive Pi, the extension keeps a live bordered `Pebble orchestrator` swimlane card above the editor plus a footer status. The card updates once per second and on subagent JSON events, showing each selected pebble across color-coded Plan, Implement, Review, and Verdict columns, plus selected/deferred pebbles, branch, current implementer/reviewer status, and latest subagent activity. If the card overflows, scroll down/up with `ctrl+j` / `ctrl+k`; the active card intentionally captures raw `ctrl+k` before Pi's editor `ctrl+k` delete-to-line-end binding. `/peb-scroll up` / `/peb-scroll down`, `ctrl+shift+j` / `ctrl+shift+k`, and raw terminal `alt+↑` / `alt+↓` or `alt+k` / `alt+j` remain fallbacks.

Registered tools for agent use:

- `generate_image` — creates bitmap images by shelling out to `codex exec`, using Codex CLI's hosted image generation and subscription-backed auth, then verifies and saves the bitmap locally. Defaults to `/Users/brandon/Pictures/gpt-images/`. Requires `codex` to be installed and logged in.
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
