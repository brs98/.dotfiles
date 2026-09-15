# Runtime and setup

The launcher uses the published `@shortcut/mcp` package through the official MCP
client SDK. Its dependency versions are recorded in `shortcut-rest/mcp/package-lock.json`.
The local upstream server is archived; this integration deliberately uses that
published implementation to retain API-token authentication without hosted OAuth.
Source: https://github.com/useshortcut/mcp-server-shortcut

On another machine, install the locked runtime without lifecycle scripts:

```bash
cd ~/.agents/skills/shortcut-rest/mcp
npm ci --ignore-scripts --no-audit --no-fund
```

Python 3 and a Node version supported by the installed packages must be available.
No runtime package downloading occurs during tool calls. To update dependencies,
use npm in that directory, inspect the changes, test, and commit the lockfile.

## Token enrollment

Existing credentials continue to work. For first-time setup, create a v3 token
at https://app.shortcut.com/settings/account/api-tokens, then run:

```bash
SC=~/.agents/skills/shortcut-sixfifty/scripts/shortcut-sixfifty.py
python3 "$SC" setup
```

Wait for the hidden prompt, paste directly into the terminal, and press Enter.
The token is not echoed or placed in shell history. Setup verifies SixFifty
before saving its workspace UUID and token in an owner-only credential file at
`~/.config/shortcut/workspaces/sixfifty/credentials.json`. Never inspect that file.
Use `rotate-token` to replace the token while preserving the workspace lock.

## Commands

```bash
SC=~/.agents/skills/shortcut-sixfifty/scripts/shortcut-sixfifty.py
python3 "$SC" whoami
python3 "$SC" list-tools
python3 "$SC" describe-tool stories-get-by-id
python3 "$SC" call-tool workflows-list
python3 "$SC" call-tool stories-get-by-id --arguments-file /tmp/shortcut-args.json
python3 "$SC" rotate-token
```

Build argument JSON from `describe-tool`'s `inputSchema`, including required
fields. The launcher returns `{workspace, result}`; tool calls retain the MCP
result's content blocks and structured content when present. Tool failures exit
nonzero with a sanitized error. Raw upstream diagnostics are suppressed.

The handwritten REST operation commands (such as `story`, `search`, and
`update-story`) have been replaced by `call-tool` with upstream tool names.
Use discovery rather than a static tool list: the installed server determines
available tools and their schemas. It covers stories, comments, subtasks,
relations, external links, uploads, epics, iterations, Docs, objectives, teams,
users, workflows, labels, projects, and custom fields.

Every command verifies the enrolled workspace before starting the server.
The process closes after each call; timeouts terminate the whole process group.
A cancelled network mutation can still complete remotely: inspect before retrying.
