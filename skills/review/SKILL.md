---
name: review
description: Runs comprehensive PR/code reviews with specialized subagents for code quality, tests, comments, error handling, types, and simplification. Use when the user asks to review a PR, inspect a git diff, run /review, or evaluate changes with aspects like code/tests/comments/errors/types/simplify.
---

# Comprehensive PR Review

Run a comprehensive pull-request/code review using specialized Pi subagents. Focus on changed code by default and report actionable findings with file/line references.

## Hard requirement: use subagents

You MUST use the `subagent` tool for this skill. Do not perform the specialist reviews only in the main conversation. Launch one subagent per selected reviewer and pass the matching reviewer prompt from [REVIEWER_PROMPTS.md](REVIEWER_PROMPTS.md) as that subagent's `role` instructions.

If the `subagent` tool is unavailable, stop and tell the user that review requires the Pi subagents extension/tool to be loaded, then ask them to enable it and retry.

## Arguments/aspects

The user may request aspects by name:

- `all` or no aspects: run all applicable reviews.
- `code`: general code quality and project-guideline review.
- `tests`: test coverage quality and completeness.
- `comments`: comment and documentation accuracy.
- `errors`: silent failure and error-handling audit.
- `types`: type design and invariant analysis.
- `simplify`: simplification/refactoring opportunities that preserve behavior.
- `parallel`: run selected reviewer subagents concurrently. This is the default when more than one reviewer is selected.
- `sequential`: run selected reviewer subagents one at a time.

## Workflow

1. Determine review scope.
   - Run `git status --short`.
   - Run `git diff --name-only` and inspect `git diff`.
   - If no unstaged changes exist, check staged changes with `git diff --cached`.
   - If a PR exists, `gh pr view` may provide context, but do not require GitHub CLI.
   - Prefer reviewing the diff instead of the entire repository.
2. Load project guidance.
   - Check relevant project context files such as `AGENTS.md`, `CLAUDE.md`, `README.md`, contributor docs, style guides, and test docs.
   - Treat explicit project rules as higher priority than generic advice.
3. Determine applicable reviewers.
   - Always applicable: `code`.
   - If tests changed or production behavior changed: `tests`.
   - If comments/docs were added or modified: `comments`.
   - If error handling, fallbacks, optional/null flows, retries, logging, or catch blocks changed: `errors`.
   - If new/modified types, schemas, data models, interfaces, classes, enums, or state machines appear: `types`.
   - If implementation is working but appears complex or the user requested polish: `simplify`.
4. Run selected reviewers with `subagent`.
   - Launch one subagent per reviewer using the corresponding prompt in [REVIEWER_PROMPTS.md](REVIEWER_PROMPTS.md) as its `role` instructions.
   - Give every subagent the same scope, diff summary, relevant project guidance, and instruction to return only its focused report.
   - Default to parallel subagents when more than one reviewer is selected.
   - Use sequential subagents only if the user passes `sequential` or if a later reviewer explicitly depends on an earlier result.
   - Reviews are advisory by default. Do not modify files unless the user explicitly asks you to apply fixes.
5. Aggregate subagent reports into the final format below.

## Final output format

```markdown
# PR Review Summary

Reviewed: [scope summary]
Reviewers run: [code, tests, comments, errors, types, simplify]

## Critical Issues ([count])

- [reviewer] [file:line] Issue summary
  - Why it matters: ...
  - Recommended fix: ...

## Important Issues ([count])

- ...

## Suggestions ([count])

- ...

## Strengths

- ...

## Recommended Action

1. Fix critical issues first.
2. Address important issues.
3. Consider suggestions.
4. Re-run the review after fixes.
```

If there are no high-confidence issues, say so clearly and summarize what was checked.
