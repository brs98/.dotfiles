# TASK

Review completed Picastle branch `{{BRANCH}}` for pebbles issue {{TASK_ID}}: {{ISSUE_TITLE}}

This is review pass {{REVIEW_PASS}} of at most {{MAX_REVIEW_CYCLES}}.

You are the reviewer. Do **not** edit files. Do **not** commit. Do **not** push. Do **not** open a PR. Your job is to inspect, run checks when appropriate, and provide structured feedback.

# PATHS

- Worktree: `{{WORKTREE_PATH}}`
- Base branch: `{{BASE_BRANCH}}`

# ISSUE

<issue-json>
{{ISSUE_JSON}}
</issue-json>

Pebbles command prefix:

```bash
{{PEB_PREFIX}}
```

# REVIEW PROCEDURE

1. Read `AGENTS.md` in the worktree.
2. Inspect the branch:

```bash
git -C "{{WORKTREE_PATH}}" log --oneline {{BASE_BRANCH}}..HEAD
git -C "{{WORKTREE_PATH}}" diff --stat {{BASE_BRANCH}}...HEAD
git -C "{{WORKTREE_PATH}}" diff {{BASE_BRANCH}}...HEAD
```

3. Compare the implementation to the pebbles brief. Check for:
   - missing requirements
   - scope creep
   - likely regressions
   - missing or weak tests
   - code quality / architecture issues
   - docs or UX copy mismatches, if relevant

4. If `{{VERIFY}}` is true, run the relevant checks from `AGENTS.md`. Prefer targeted checks first, but use full checks when the touched surface is broad or ambiguous.

Checks may create normal build/test artifacts, but you must not edit source files or make commits.

# OUTPUT

Output exactly one JSON object wrapped in `<review>` tags.

Approved:

<review>
{"status":"approved","summary":"Looks ready.","findings":[],"checks":["cd ui && npm run test"]}
</review>

Changes requested:

<review>
{"status":"changes_requested","summary":"Needs a regression test.","findings":[{"severity":"blocking","file":"ui/src/example.test.tsx","summary":"Missing coverage for stale updater refresh.","recommendation":"Add a test that advances timers past the stale threshold and asserts check_for_update is invoked."}],"checks":["cd ui && npm run test"]}
</review>

Blocked:

<review>
{"status":"blocked","summary":"Cannot validate because required dependency is unavailable.","findings":[{"severity":"blocking","file":null,"summary":"Environment is missing X.","recommendation":"Retry with X installed."}],"checks":[]}
</review>

Use `approved`, `changes_requested`, or `blocked`. Do not include text outside the `<review>` block except brief progress notes if needed.
