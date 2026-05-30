# TASK

Fix pebbles issue {{TASK_ID}}: {{ISSUE_TITLE}}

You are running through Picastle, a Pi SDK host-worktree orchestrator. This is not Docker. You are in a dedicated host git worktree on branch:

`{{BRANCH}}`

Base branch: `{{BASE_BRANCH}}`

{{STACK_CONTEXT}}

Only work on this issue.

# ISSUE

<issue-json>
{{ISSUE_JSON}}
</issue-json>

Picastle is using this peb command prefix:

```bash
{{PEB_PREFIX}}
```

The current task can be inspected with:

```bash
{{PEB_SHOW_TASK}}
```

If the issue references a parent PRD, linked issue, or dependency edge, inspect it with the same peb prefix before editing.

Do not mutate pebbles state directly. Do not run `peb create`, `peb close`, or `peb comment add`. If you need to file follow-up work or leave a handoff comment, use the pending manifest format below.

# CONTEXT

Recent commits:

<recent-commits>
{{RECENT_COMMITS}}
</recent-commits>

Read `AGENTS.md` before changing code and follow the repository's commands and terminology.

# EXECUTION

Prefer red/green/refactor when practical:

1. Add or adjust one focused test that exposes the issue.
2. Implement the smallest fix.
3. Repeat until the task is complete.
4. Refactor only when it improves clarity without expanding scope.

# FEEDBACK LOOPS

Pick the check surface that matches your change. If the repo's `AGENTS.md` lists different canonical commands, use those.

All relevant checks should pass before you commit. If a full check is too expensive after a narrower check, say exactly what you ran and why.

# COMMIT

Make a git commit using conventional commit style.

The commit message must:

1. Use a subject under 72 chars.
2. Explain material changes in the body when useful.
3. End with this trailer on its own line:

`Closes: {{TASK_ID}}`

Do not close the pebbles issue manually. The PR body/commit trailer handles closure after human merge.

# PENDING COMMENTS

If the task is not complete, append a comment intent for the host:

```bash
mkdir -p .picastle
printf '%s\n' "$(jq -nc \
  --arg id "{{TASK_ID}}" \
  --arg body "What I did and what's left to do…" \
  '{id: $id, body: $body}')" >> .picastle/pending-comments.jsonl
```

# FILING NEW ISSUES

If you discover follow-up work, append one JSON object per intended issue to `.picastle/pending-issues.jsonl`:

```json
{
  "title": "<conventional-commit-style title>",
  "description": "<full body>",
  "status": "{{PENDING_STATUS}}",
  "labels": [],
  "type": "bug",
  "priority": 2
}
```

Rules:

- Use status `{{PENDING_STATUS}}` unless the repo's pebbles policy clearly requires a different triage state.
- Do not mark follow-up work as ready for agent.
- `type` is one of `feature`, `bug`, `chore`, `decision`.
- `priority` is 0-4.

# FINAL

When complete, output:

<promise>COMPLETE</promise>
