# Setup and use

Create a **v3 API token** at https://app.shortcut.com/settings/account/api-tokens.
The transport uses the stable v3 REST API, not the alpha v4 API.

Run in an interactive terminal (a Herdr shell pane works):

```bash
python3 ~/.agents/skills/shortcut-sixfifty/scripts/shortcut-sixfifty.py setup
```

Wait for the **hidden** token prompt before pasting. Press Enter. The token is
not echoed or passed through shell history, arguments, or environment variables.
Setup verifies the `sixfifty` workspace before saving anything. It records the
workspace UUID and refuses to overwrite an existing enrollment.

Storage: `~/.config/shortcut/workspaces/sixfifty/credentials.json` (mode 600).
Do not read this file manually or commit it. The launcher loads it internally.

To replace an expired or revoked token while retaining the enrolled workspace:

```bash
python3 ~/.agents/skills/shortcut-sixfifty/scripts/shortcut-sixfifty.py rotate-token
```

## Operations

```bash
SC=~/.agents/skills/shortcut-sixfifty/scripts/shortcut-sixfifty.py
python3 "$SC" whoami
python3 "$SC" search 'is:story owner:me'
python3 "$SC" story 1234
python3 "$SC" comments 1234
python3 "$SC" workflows
python3 "$SC" groups
python3 "$SC" create-story --body-file /tmp/story.json
python3 "$SC" update-story 1234 --body-file /tmp/update.json
python3 "$SC" add-comment 1234 --body-file /tmp/comment.json
```

Create-story body example (replace workflow state with a discovered ID):

```json
{"name":"Example story","story_type":"feature","workflow_state_id":123,"description":"Requirements"}
```

Update-story body: `{"description":"Revised requirements"}`.
Comment body: `{"text":"Comment text"}`.
Only include intended fields in update bodies. Preserve existing descriptions
when making partial editorial changes. Remove temporary bodies when finished.

Search returns one page plus pagination metadata. Supply its relative `next`
URL via `search '<same query>' --next '<returned next>'` until it is empty.
Other discovery commands return their endpoint response as documented.

The client intentionally exposes a small operation catalog: story reads, search,
comments, story create/update, and discovery. Unsupported operations require an
explicit transport extension, checked against the official schema and tests.
No deletion or bulk mutation command is provided.

API reference: https://developer.shortcut.com/api/rest/v3
