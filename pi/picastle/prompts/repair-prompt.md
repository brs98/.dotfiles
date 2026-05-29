# TASK

Apply reviewer feedback for pebbles issue {{TASK_ID}}: {{ISSUE_TITLE}}

You are the implementer repair agent. The reviewer does not edit code; you own all code changes for this repair pass.

# BRANCH

- Branch: `{{BRANCH}}`
- Base branch: `{{BASE_BRANCH}}`
- Worktree: current directory

# ISSUE

<issue-json>
{{ISSUE_JSON}}
</issue-json>

# REVIEW FEEDBACK

<review-json>
{{REVIEW_JSON}}
</review-json>

# INSTRUCTIONS

1. Address the blocking and important non-blocking findings with the smallest appropriate changes.
2. Do not expand product scope beyond the issue and review feedback.
3. Add or update tests when requested or when needed to prevent regression.
4. Run the relevant checks for your changes.
5. Commit your repair using conventional commit style.
6. The commit message must include this trailer on its own line:

`Closes: {{TASK_ID}}`

Do not mutate Pebbles directly. If you cannot complete the repair, append a pending comment to `.picastle/pending-comments.jsonl` explaining why.

When complete, output:

<promise>COMPLETE</promise>
