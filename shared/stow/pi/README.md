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
- `fusion-harness/` — a pinned, locally hardened fork of Fusion Harness. Claude roles run through the official Claude Code CLI with subscription OAuth; the builder and host run through Pi's `openai-codex` subscription provider.

## Fusion Harness

Launch the hybrid harness from any trusted repository:

```bash
fusion
```

The shell function selects:

- Host/builder: `openai-codex/gpt-5.6-sol` through Pi and the ChatGPT subscription login.
- Architect/fuser/validator: `claude-code/claude-fable-5` through the installed official `claude -p` CLI.

Claude children use `--safe-mode`, explicit tool allowlists, and fresh non-persistent sessions. Before every Claude role, the harness runs `claude auth status --json` in a sanitized environment and proceeds only for logged-in `claude.ai` or `oauth_token` authentication. It removes API-key, custom-base-URL, and cloud-provider selectors without reading their values, preventing an accidental pay-as-you-go or proxy fallback. Do not launch with `--bare`; Claude Code bare mode disables subscription OAuth.

Authenticate once with your Claude subscription before using the harness:

```bash
claude auth login
claude auth status --text
```

As of July 2026, Anthropic has paused the announced separate monthly Agent SDK credit. `claude -p` currently draws from the normal subscription usage limits; the proposed $200 Max 20x monthly Agent SDK credit is not currently available. See Anthropic's [Agent SDK plan notice](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan).

Available commands:

```text
/opinion <prompt>                         # two read-only answers
/fusion <prompt> [:: <merge instruction>] # two read-only analyses, then a tool-free merge
/system-prompt                            # inspect role prompts
/thinking <architect> [builder]           # adjust effort
/fh-reset                                 # reset Pi role state
```

`/auto-validate` is disabled by default because upstream executes model-authored Python. It remains available only when Pi is deliberately started with `--allow-model-authored-gates` inside a trusted OS sandbox. The opt-in path also runs `uv` offline with a minimal environment, but that is not an OS security boundary.

The vendored source is based on `disler/fusion-harness` commit `5852f2ed4f5f064a368d83d2dabad84fe6bfa0b4`. See `extensions/fusion-harness/UPSTREAM.md` and `LICENSE.upstream`.

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
