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
python3 "$SC" call-tool teams-list --json
python3 "$SC" create-story --name 'Test' --type chore --owner me --team Engineering \
  --state 'On Deck' --custom-field 'Creative Period Team=MCPizza' --dry-run
python3 "$SC" rotate-token
```

Build argument JSON from `describe-tool`'s `inputSchema`, including required
fields. The launcher returns `{workspace, result}`; tool calls retain the MCP
result's content blocks and structured content when present. Tool failures exit
nonzero with a sanitized error. Raw upstream diagnostics are suppressed.

`call-tool --json` unwraps the result instead: stdout is only the parsed
`<json>` payload (a list if a tool returns several), or the plain text when
there is none. The deprecation notice is dropped. The summary line (for example
`Result (25 shown of 80 total stories found):`) and `next_page_token: <token>`
go to stderr; pass that token back as the tool's `nextPageToken` argument.
The workspace check still runs first.

Story reads: `stories-get-by-id` is slim by default and omits `group_id`
(team), `workflow_id`, and custom fields. After any story write other than
`create-story`, read it back with `{"storyPublicId": N, "full": true}`.

The handwritten REST operation commands (such as `story`, `search`, and
`update-story`) have been replaced by `call-tool` with upstream tool names.
Use discovery rather than a static tool list: the installed server determines
available tools and their schemas. It covers stories, comments, subtasks,
relations, external links, uploads, epics, iterations, Docs, objectives, teams,
users, workflows, labels, projects, and custom fields.

Every command verifies the enrolled workspace before starting the server.
The process closes after each call; timeouts terminate the whole process group.
A cancelled network mutation can still complete remotely: inspect before retrying.

## create-story

```text
create-story --name NAME [--description TEXT | --description-file PATH]
             --type {feature,bug,chore} [--owner MENTION|me]... --team TEAM
             --state STATE [--custom-field 'Field Name=Value']...
             [--epic ID|NAME] [--iteration ID|NAME] [--label NAME]... [--dry-run]
```

Use it instead of the MCP `stories-create`. That tool picks the team's first
listed workflow (not its default) and its default state, ignores custom fields,
and has created SixFifty stories with no team in the Design workflow while
reporting success.

Resolution is read-only REST through the locked launcher, after the workspace
check: `/groups` (Team name or mention name, archived teams excluded), the
team's `default_workflow_id` and `/workflows/{id}` states, `/members` (mention
name or full name, disabled members excluded; `me` is the token's user),
`/custom-fields` (enabled fields and values; story-type restrictions enforced),
`/epics`, `/iterations` (ID or name), and `/labels` (existing labels only).
Matches are exact and case-insensitive, with a leading `@` ignored. A missing
or ambiguous name fails before any write and lists the candidates. `--state`
is required: there is no default state, and a team without a default workflow
is an error.

The write is a single `POST /stories` setting `name`, `story_type`,
`group_id`, `workflow_state_id`, `owner_ids`, `custom_fields`, and when given
`description`, `epic_id`, `iteration_id`, and `labels`. `--dry-run` prints that
exact payload and writes nothing. A failed or timed-out POST is never retried.

The story is then read back with `GET /stories/{id}` and compared on name,
description, type, team, workflow, workflow state, owners, requested custom
fields, epic, iteration, and labels. The result is
`{workspace, result: {status, id, url, resolved}}` where `resolved` holds the
team, workflow, state, owner, and custom-field names. `status` is `created`
(exit 0), `mismatch`, or `unverified` (exit 1; each mismatch is printed to
stderr with the story ID and URL). Fix a mismatched story with `stories-update`
(`team_id`, `workflow_state_id`, `custom_fields`, ...); do not recreate it.

**Team vs Creative Period Team.** *Team* is the Shortcut Team (Engineering,
default workflow "Engineering Workflow"; Engineering Support shares it).
*Creative Period Team* is an enum custom field (MCPizza, The Welcome Wagon,
...). "Engineering, creative period team MCPizza" is
`--team Engineering --custom-field 'Creative Period Team=MCPizza'`.
The MCP `stories-create` cannot set custom fields; `create-story` does.

## Custom-field search fallback

```bash
python3 "$SC" search-custom-field --field 'Creative Period Team' --value 'The Welcome Wagon'
```

Matches exact names case-insensitively and rejects missing or ambiguous names.
The launcher queries `/custom-fields`, then the read-only `POST /stories/search`
endpoint separately for active and archived stories, requesting descriptions.
This documented endpoint returns an array without pagination; the fallback
filters by both field UUID and value UUID and deduplicates story IDs. It returns
`scanned_count`, `matched_count`, and only matching stories. This is a workspace
scan and can take longer than an indexed search. Completed stories are included.
API reference: https://developer.shortcut.com/api/rest/v3#Query-Stories
