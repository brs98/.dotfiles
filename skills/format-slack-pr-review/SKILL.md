---
name: format-slack-pr-review
description: "Format GitHub pull requests as Slack-friendly links. Use when user wants to share PRs in Slack, format PR links, or mentions 'slack pr', 'pr review', or 'format pr for slack'."
user-invocable: true
---

# Format Slack PR Review

## Overview

Format GitHub pull request(s) as concise Slack-ready text: `<url> <title>` with reviewers listed separately.

## Workflow

1. **Determine which PRs to format.** Only format PRs that are already known to this agent in its current context. Resolve in this order:

   1. **Explicit arguments from the user** — PR URLs (`https://github.com/owner/repo/pull/123`) or numbers with optional repo (`#123`, `owner/repo#123`).
   2. **PRs present in the current conversation context** — PRs this agent created earlier in the session (e.g. via `gh pr create`), PR URLs/numbers the user pasted, or PRs returned by previous tool calls in this conversation.

   **Do not** run `gh pr list`, `gh pr list --author @me`, or any other command that enumerates PRs the agent does not already know about. The goal is to avoid pulling in unrelated PRs from the user's broader GitHub activity.

   If nothing is resolvable from the above, ask the user which PR(s) they want formatted rather than guessing or listing.

2. **Fetch PR details** for each resolved PR using `gh`:
   ```bash
   gh pr view <number-or-url> --json url,title,reviewRequests
   ```
   If multiple PRs are being formatted, fetch them in parallel.

3. **Format the output** according to the rules below.

## Output Format

**Single PR:**
```
<url> [<reviewers>] <title>
```

Example:
```
https://github.com/acme/app/pull/42 [alice, bob] Fix login timeout on mobile Safari
```

**Multiple PRs:**
List the PRs first (one per line, no reviewers inline), then a blank line, then all unique reviewers as a comma-separated line.

```
<url> <title>
<url> <title>
<url> <title>

<reviewer1>, <reviewer2>, <reviewer3>
```

Example:
```
https://github.com/acme/app/pull/42 Fix login timeout on mobile Safari
https://github.com/acme/app/pull/38 Add rate limiting to /api/upload
https://github.com/acme/app/pull/35 Bump Rails to 7.2

alice, bob, charlie
```

## Clipboard

After formatting, automatically copy the output to the clipboard and confirm to the user. Use the appropriate clipboard command for the platform:
- **macOS**: `pbcopy`
- **Linux (Wayland)**: `wl-copy`
- **Linux (X11)**: `xclip -selection clipboard`
- **WSL/Windows**: `clip.exe`

## Notes

- Output plain text only — no markdown, no bullet points, no headers. The output should be directly pasteable into Slack.
- Reviewers in the bottom list should be deduplicated and sorted alphabetically.
- If no reviewers are assigned across any PR, omit the reviewers line entirely.
- If no PRs match, tell the user clearly.
