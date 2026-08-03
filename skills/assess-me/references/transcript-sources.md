# Transcript sources — hints catalog

These are **known defaults**, not authoritative.
You know which host you are running under.
Use the row for your host if it matches; if your host is not listed, or your install stores transcripts elsewhere, **discover the location yourself** with your file tools and proceed.
Never fabricate a location.

All extraction is read-only and local.
Do not send transcript content anywhere.

| Host | Location | Format | Where the user's prose lives |
|---|---|---|---|
| Claude Code | `~/.claude/projects/<slug>/*.jsonl` (top-level only; nested `*/subagents/*` are sub-agents, skip) | JSONL, one event/line | records with `type=user` → `message.content` when it is a **string** (a list is a tool result, skip) |
| Codex | `~/.codex/history.jsonl` (flat, cleanest) or `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` | JSONL | `history.jsonl`: `.text`. rollout: `payload.role=user` → `content[].input_text.text` |
| cursor-agent | `~/.cursor/prompt_history.json` (flat, cleanest) or `~/.cursor/chats/<workspace>/<session-uuid>/` | JSON array of strings; per-session dirs | each array element is a raw user prompt |
| opencode | `~/.local/share/opencode/opencode.db` | SQLite (Drizzle) | `part.data.text` where `json_extract(part.data,'$.type')='text'`, joined to `message` rows with `json_extract(message.data,'$.role')='user'` |
| pi | `~/.pi/agent/sessions/--<cwd>--/*_*.jsonl` | JSONL (branching tree; `id`/`parentId`) | nodes with `type=user` → the message text field |

## Filtering to real prose

Whatever store you read, keep only the user's typed prose.
Drop:
- slash-command echoes and system wrappers — anything starting with `<` (e.g. `<command-name>…`, `<system-reminder>…`) or a bare `/command` (`/exit`, `/clear`, `/pr`);
- tool-result messages (in Claude Code these are `user` records whose `content` is a **list**, not a string);
- context-compaction / continuation summaries (Claude Code: text starting with `This session is being continued`);
- interruption markers (`[Request interrupted…]`) and empty lines.

## Helper

If Python 3 is available, `scripts/extract_prompts.py` does all of the above and emits normalized rows `{host, session, ts, prompt, words}`:

```
python3 scripts/extract_prompts.py --host <claude|codex|cursor|opencode|pi|auto> --last 20 --out /tmp/prompts.json
```

`--host auto` scans every store present on the machine and merges them (each row tagged with its `host`).
`--last N` takes the N most-recent sessions for session-grouped stores, or the most-recent N×20 prompts for flat prompt logs.
Pass `--since YYYY-MM-DD` or `--path` to override.
If Python is unavailable, read and filter the store yourself using the table above.
