---
name: format-slack-pr-review
description: "Format GitHub pull requests as Slack-friendly links. Use when user wants to share PRs in Slack, format PR links, or mentions 'slack pr', 'pr review', or 'format pr for slack'."
user-invocable: true
---

# Format Slack PR Review

## Overview

Format GitHub pull request(s) as concise Slack-ready text: `<url> <title>` with reviewers listed separately.

## Workflow

1. **Determine which PRs to format.** Accept any of:
   - PR URLs (`https://github.com/owner/repo/pull/123`)
   - PR numbers with optional repo (`#123`, `owner/repo#123`)
   - A repo name to list recent open PRs (`owner/repo`)
   - No argument — use the current repo's open PRs authored by the current user

2. **Fetch PR details** using `gh`:
   ```bash
   # Single PR by number or URL
   gh pr view <number-or-url> --json url,title,reviewRequests

   # List open PRs for current repo by current user
   gh pr list --author @me --json url,title,reviewRequests

   # List open PRs for a specific repo
   gh pr list --repo owner/repo --json url,title,reviewRequests
   ```

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
