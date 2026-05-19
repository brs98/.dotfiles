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
