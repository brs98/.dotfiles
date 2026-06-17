---
name: resume-harness-session
description: Use when the user provides a previous agent session id, transcript path, JSONL log, chat export, or asks to resume, recover, or get context from Claude Code, Codex, Oh My Pi, Pi, or another agent harness.
---

# Resume Harness Session

Recover prior work without confusing harness noise for user intent.

## Core principle

A session log is an event graph, not a chat transcript. Reconstruct the active workstream, side artifacts, decisions, evidence, and clean resume point.

## Quick start

For Claude Code logs, build a deterministic index first:

```bash
~/.dotfiles/skills/resume-harness-session/scripts/summarize-claude-jsonl.mjs --project-dir ~/.claude/projects/<project-key> --id <session-id>
```

Use the script output as an index, not final truth; read referenced logs/artifacts before claiming facts.

## Workflow

1. **Identify the harness and roots**
   - Claude Code: `~/.claude/projects/<project-key>/<session-id>.jsonl`, plus `<session-id>/subagents/` and optional `/private/tmp/claude-*/*/<session-id>/tasks/`.
   - Oh My Pi / Pi: resolve provided `agent://`, `artifact://`, `local://`, or filesystem transcript references with `read`; inspect adjacent artifacts only when named or referenced.
   - Other harnesses: find the transcript/export, then adjacent artifact, task, agent, workspace, or attachment directories.
   - Multiple matches: exact id first; otherwise newest, with uncertainty called out.

2. **Read minimally, then parse deliberately**
   - Start with directory listing and bounded reads of the main transcript.
   - Parse JSONL structurally. Preserve `uuid`, `parentUuid`, `timestamp`, `type`, `message.role`, and tool ids.
   - Use `leafUuid`, `parentUuid`, or equivalents when present; otherwise summarize chronology and call out ambiguity.

3. **Separate signal from harness noise**
   - Keep: user asks/answers, assistant conclusions, tool inputs/results, file edits, task launches, task notifications, and errors that changed course.
   - Down-rank: skill listings, hook output, permission prompts, tool inventory, cache diagnostics, synthetic limit messages.
   - Never treat a session-limit/rate-limit message as a conclusion.

4. **Follow spawned work**
   - Map task/tool-use ids to subagent metadata and logs.
   - Inspect relevant assignments, final answers, tool results, and failure states.
   - Prefer durable JSONL/sidecar logs over temp task outputs unless temp files are confirmed non-empty and richer.

5. **Recover changed artifacts only when relevant**
   - Inspect file-history snapshots, edit/write calls, and named artifacts only when resumed work depended on file changes.
   - Do not run project commands just to resume context.
   - Do not edit files unless the user explicitly asks you to continue implementation.

6. **Return a handoff, not raw archaeology**
   - State original task, user decisions, completed work, evidence, changed files, blockers/errors, and clean resume point.
   - Mark uncertainty when logs are truncated, branches conflict, or artifacts are missing.

## Claude Code JSONL quick reference

| Record | Meaning | Recovery action |
| --- | --- | --- |
| `type: user` | User message or tool result | Extract user-visible asks/answers; parse `tool_result` content |
| `type: assistant` | Assistant text/tool use | Keep conclusions and tool calls; ignore empty/thinking-only chunks |
| `type: system` | Harness/system event | Keep only errors, compaction, model/session state that changed work |
| `type: queue-operation` | Queued user input | Include if it changed direction |
| `isMeta: true` | Harness notification | Usually noise except task completion/failure summaries |
| `toolUseResult` | Structured tool result | Prefer over rendered text when summarizing facts |
| `subagents/*.meta.json` | Task metadata | Map description/tool id to `agent-*.jsonl` |
| `subagents/agent-*.jsonl` | Spawned agent transcript | Inspect assignment and final substantive output |

## Common mistakes

- Reading only the last messages and missing background agents.
- Summarizing truncated output as fact instead of reading the referenced artifact/range.
- Treating tool/skill inventory as task context.
- Losing user answers embedded in prompt/ask tool results.
- Mixing abandoned branches when `parentUuid`/leaf pointers show a different active path.
- Exposing internal agent ids unless they are useful for the user's next action.
- Re-running builds/tests/searches as a substitute for recovering the transcript.
