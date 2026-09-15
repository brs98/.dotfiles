---
name: shortcut-rest
description: Maintain Shortcut credential checks and the local MCP bridge behind workspace-locked launchers. Use when extending or debugging the Shortcut integration; use the workspace skill for ordinary operations.
---

# Shortcut transport and MCP bridge

The directory name is retained for existing launcher paths. `scripts/shortcut_core.py`
handles credential permissions, fixed-origin REST identity verification, and the
private subprocess boundary. `mcp/bridge.mjs` uses the official MCP SDK to run
`@shortcut/mcp` and discover/call its existing tools. There is no handwritten
business-operation catalog for MCP tools. `search_custom_field` is a read-only
REST fallback for advanced custom fields unsupported by MCP search. Use the `shortcut-sixfifty` launcher for user work.

Keep the preflight API origin fixed and redirects disabled. Verify workspace
slug and UUID before starting MCP. Never introduce credential-path or endpoint
overrides, ambient-token fallback, token command arguments, or preflight bypasses.
Only the launcher reads credentials; the bridge receives them over a private
pipe and sets them internally in the server environment. Suppress raw errors,
redact tokens from results, and terminate the process group on timeout.

Runtime installation (no secrets needed):

```bash
cd ~/.agents/skills/shortcut-rest/mcp
npm ci --ignore-scripts --no-audit --no-fund
```

Validation:

```bash
python3 -m unittest discover -s ~/.agents/skills/shortcut-rest/scripts -p 'test_*.py'
python3 ~/.agents/skills/shortcut-sixfifty/scripts/shortcut-sixfifty.py list-tools
python3 ~/.agents/skills/shortcut-sixfifty/scripts/shortcut-sixfifty.py call-tool workflows-list
```

Upstream source: https://github.com/useshortcut/mcp-server-shortcut
