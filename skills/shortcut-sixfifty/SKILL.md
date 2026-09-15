---
name: shortcut-sixfifty
description: Manage SixFifty Shortcut stories through a workspace-locked REST launcher. Use when reading, searching, creating, updating, or commenting on SixFifty Shortcut stories or resolving sc- references.
---

# SixFifty Shortcut

## Required entry point

Always use this launcher for SixFifty Shortcut work:

```bash
python3 ~/.agents/skills/shortcut-sixfifty/scripts/shortcut-sixfifty.py --help
```

It pins the workspace slug to `sixfifty`, pins the verified workspace UUID during
interactive enrollment, and checks both before every operation. Never use MCP,
raw curl, ambient tokens, or another workspace's credentials for this workflow.
Never change the launcher or enrolled identity during ordinary Shortcut work.

## Workflow

1. Use `whoami` to check setup when needed. If credentials are missing, direct
   the user to the hidden terminal setup described in [REFERENCE.md](REFERENCE.md).
2. Use `search`, `story`, and `comments` for targeted reads. Follow the returned
   search `next` URL with `--next`; don't assume the first page is complete.
3. Resolve IDs using `workflows`, `groups`, `members`, `labels`, `epics`, or
   `iterations`. Never guess IDs. Ask when multiple matches remain ambiguous.
4. For authorized writes, state the intended change and pass exact JSON through
   `--body-file`. Use `create-story`, `update-story`, or `add-comment`.
5. Confirm the returned workspace and report the story/comment ID and story URL.

## Credential rules

- Only the launcher may read the credential file internally. Never inspect,
  print, copy, source, or export it, or put its contents in chat or tool arguments.
- Setup and rotation accept tokens only through an interactive hidden prompt.
  The user pastes directly into the terminal; never send the token through Herdr commands.
- The credential file lives outside Git with mode 600 in an owner-only directory.
- Stop on workspace, ownership, or permission failures. Don't bypass checks.
- API errors omit response bodies. Do not retry failed writes automatically.

See [REFERENCE.md](REFERENCE.md) for commands and supported scope.
