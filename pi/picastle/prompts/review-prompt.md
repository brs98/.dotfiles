# TASK

Review completed Picastle branch `{{BRANCH}}` for pebbles issue {{TASK_ID}}: {{ISSUE_TITLE}}

This is review pass {{REVIEW_PASS}} of at most {{MAX_REVIEW_CYCLES}}.

You are the reviewer. Your tool permissions are read-only: you can read files and run `review_check`, a restricted allowlisted review runner. Do **not** edit files. Do **not** commit. Do **not** push. Do **not** open a PR. Do **not** mutate Pebbles. Your job is to inspect, run allowed checks when appropriate, and provide structured feedback.

# PATHS

- Worktree: `{{WORKTREE_PATH}}`
- Base branch: `{{BASE_BRANCH}}`

# ISSUE

<issue-json>
{{ISSUE_JSON}}
</issue-json>

Pebbles read-only command prefix (use only with `review_check` for `show`, `list`, or other read-only Pebbles subcommands):

```bash
{{PEB_PREFIX}}
```

# REVIEW PROCEDURE

1. Read `AGENTS.md` in the worktree.
2. Inspect the branch with `review_check` (you do not have bash):

```bash
git log --oneline {{BASE_BRANCH}}..HEAD
git diff --stat {{BASE_BRANCH}}...HEAD
git diff {{BASE_BRANCH}}...HEAD
```

3. Compare the implementation to the pebbles brief. Check for:
   - missing requirements
   - scope creep
   - likely regressions
   - missing or weak tests
   - code quality / architecture issues
   - docs or UX copy mismatches, if relevant

4. If `{{VERIFY}}` is true, run relevant read-only source inspection checks from `AGENTS.md` only through `review_check`. Do not run package scripts, test runners, compilers, or build tools; reviewers do not have a sandbox for executing branch-controlled project code. If validation requires executable checks, record that gap in `checks` and explain it in `summary` or a finding.

`review_check` rejects mutating git/gh/peb commands, project-code execution, general shell syntax, redirects, commits, pushes, PR creation, and Pebbles writes.

# OUTPUT

Output exactly one JSON object wrapped in `<review>` tags.

Approved:

<review>
{"status":"approved","summary":"Looks ready.","findings":[],"checks":["git diff --stat {{BASE_BRANCH}}...HEAD"]}
</review>

Changes requested:

<review>
{"status":"changes_requested","summary":"Needs a regression test. Could not execute npm tests because reviewer tools do not run branch-controlled code.","findings":[{"severity":"blocking","file":"ui/src/example.test.tsx","summary":"Missing coverage for stale updater refresh.","recommendation":"Add a test that advances timers past the stale threshold and asserts check_for_update is invoked."}],"checks":["git diff {{BASE_BRANCH}}...HEAD","not run: cd ui && npm run test (project-code execution rejected)"]}
</review>

Blocked:

<review>
{"status":"blocked","summary":"Cannot validate because required dependency is unavailable.","findings":[{"severity":"blocking","file":null,"summary":"Environment is missing X.","recommendation":"Retry with X installed."}],"checks":[]}
</review>

Use `approved`, `changes_requested`, or `blocked`. Do not include text outside the `<review>` block except brief progress notes if needed.
