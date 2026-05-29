# ISSUES

Here are the pebbles issues selected by Picastle:

- status: `{{ISSUE_STATUS}}`
- policy ready label: `{{POLICY_READY_LABEL}}`
- extra label filter: `{{ISSUE_LABEL}}`

<issues-json>
{{ISSUES_JSON}}
</issues-json>

Here are the bounded open GitHub PR inputs Picastle found. This JSON is not an
unbounded list of all open PRs; it contains same-repository Picastle heads and
legacy Sandcastle heads only.

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

For each candidate issue X, check whether any supplied PR `headRefName` is a Picastle/Sandcastle branch for that exact issue: `picastle/X-<slug>` or `sandcastle/X-<slug>`. Match only against the known candidate issue IDs in `<issues-json>` and prefer the longest exact issue-id prefix before the slug. For example, when both `web-api` and `web-api-abc` are known, `picastle/web-api-abc-fix` belongs to `web-api-abc`, not `web-api`. If such a PR exists, the issue is already in flight and must not be planned. Do not infer that unrelated PRs are absent; the PR input is intentionally bounded to Picastle/Sandcastle heads.

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

When at least one issue is unblocked:

<plan>
{"issues": [{"id": "repo-srr", "title": "fix(ui): window drag", "branch": "picastle/repo-srr-window-drag"}]}
</plan>

When every candidate is blocked or filtered:

<plan>
{"issues": []}
</plan>

Do not plan blocked issues.
