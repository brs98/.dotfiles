# ISSUES

Here are the pebbles issues selected by Picastle:

- status: `{{ISSUE_STATUS}}`
- policy ready label: `{{POLICY_READY_LABEL}}`
- extra label filter: `{{ISSUE_LABEL}}`

<issues-json>
{{ISSUES_JSON}}
</issues-json>

Here are the open GitHub PRs:

<open-prs-json>
{{OPEN_PRS_JSON}}
</open-prs-json>

Pebbles is the canonical issue tracker for this repo. The Picastle orchestrator is using this peb command prefix:

```bash
{{PEB_PREFIX}}
```

Issue IDs must be preserved exactly.

# TASK

## 1. Filter out issues that already have an open PR

For each candidate issue X, check whether any PR `headRefName` equals `picastle/X-<anything>` or `sandcastle/X-<anything>`. If so, the issue is already in flight and must not be planned.

## 2. Build a dependency graph

For each remaining candidate, determine whether it is blocked by any other selected issue or open PR.

An issue is blocked if:

- it explicitly says it depends on / is blocked by / is soft-blocked on another issue or PR
- native pebbles dependency data says it has unresolved dependencies
- it needs code, APIs, schema, or decisions introduced by another open issue or PR
- it overlaps files/modules enough that concurrent implementation is likely to conflict

Only plan issues with zero blockers.

## 3. Assign branch names

Use branch format:

`picastle/{id}-{slug}`

where `{id}` is the pebbles ID and `{slug}` is a short kebab-case title summary.

# OUTPUT

Output only a JSON object wrapped in `<plan>` tags.

Schema:

```json
{
  "issues": [
    {"id": "repo-srr", "title": "fix(ui): window drag", "branch": "picastle/repo-srr-window-drag"}
  ],
  "skipped": [
    {
      "id": "repo-abc",
      "title": "feat(api): blocked example",
      "category": "existing_pr | dependency | overlap_risk | missing_context | policy_status | other",
      "reason": "Concise, specific reason this candidate was not planned.",
      "blockers": ["PR #123", "repo-xyz"]
    }
  ]
}
```

Rules:

- Include every candidate issue exactly once, either in `issues` or `skipped`.
- Use `existing_pr` when a `picastle/{id}-*` or `sandcastle/{id}-*` PR is already open.
- Use `dependency` for explicit or native unresolved dependencies.
- Use `overlap_risk` when concurrent work is likely to conflict with an open PR or selected issue.
- Use `missing_context` when the issue cannot be planned safely because the brief lacks enough context.
- Use `policy_status` when labels/status/policy make it ineligible despite being present in the candidate JSON.
- Do not output `{"issues": []}` without populated `skipped` explanations unless there were zero candidates.

When at least one issue is unblocked:

<plan>
{"issues": [{"id": "repo-srr", "title": "fix(ui): window drag", "branch": "picastle/repo-srr-window-drag"}], "skipped": [{"id": "repo-abc", "title": "feat(api): blocked example", "category": "overlap_risk", "reason": "Touches the same API module as open PR #123.", "blockers": ["PR #123"]}]}
</plan>

When every candidate is blocked or filtered:

<plan>
{"issues": [], "skipped": [{"id": "repo-abc", "title": "feat(api): blocked example", "category": "existing_pr", "reason": "Open PR #123 already uses picastle/repo-abc-api-example.", "blockers": ["PR #123"]}]}
</plan>

Do not plan blocked issues.
