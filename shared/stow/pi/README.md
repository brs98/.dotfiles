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
- `lsp.ts` — adds `lsp_diagnostics` with per-language/per-root server isolation for worktrees and subagents.
- `mcp/` — adds lazy MCP tools plus the `/mcp` command.
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

When a workspace is active, `workspace-switcher.ts` rewrites relative `read`, `write`, `edit`, `ls`, `grep`, and `find` paths to that workspace and prefixes `bash` commands with `cd <workspace> &&`. It also nudges `lsp_diagnostics` to use the active workspace when its cwd is omitted. Absolute paths are left unchanged.

Aliases live in `~/.pi/agent/workspaces.json` as a simple map from name to path.

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
