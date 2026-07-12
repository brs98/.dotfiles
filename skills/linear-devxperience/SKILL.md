---
name: linear-devxperience
description: Use when reading, searching, creating, updating, or commenting on issues in the devxperience Linear workspace, or when the user mentions devxperience Linear work.
---

# Devxperience Linear

## Required Entry Point

Always use the locked launcher. Never call the generic transport, raw `curl`,
an MCP Linear tool, or an ambient `LINEAR_API_KEY` for devxperience work.

```bash
DEVX=~/.agents/skills/linear-devxperience
node "$DEVX/scripts/linear-devxperience-gql.mjs" <query.graphql> [options]
```

The launcher is pinned in code to the devxperience organization UUID, URL key,
and credential path. It verifies both identities before every operation and has
no workspace override. Never edit or replace the launcher during Linear work.

## Workflow

1. Use bundled operations from `~/.agents/skills/linear-graphql/operations/`.
2. Use the targeted team, state, label, project, or user operation when an ID is
   needed. Follow `pageInfo`; never guess an ID from a display name.
3. If more than one team could match, ask the user which team to use.
4. Pass user data through `--variables` or `--variables-file`.
5. For uncommon behavior, write a minimal GraphQL document requesting only the
   fields needed. Use targeted introspection instead of a full schema dump.
6. Before a mutation, state the intended devxperience change. The locked
   launcher always returns verified workspace metadata; confirm it and report
   the returned issue identifier or comment ID and relevant URL.

Run the launcher with `--help` for transport flags. See [REFERENCE.md](REFERENCE.md)
for concise issue-management examples.

## Safety

- Only the locked launcher may load the credential file internally. Never
  inspect, print, copy, source, or export it manually.
- Do not add workspace, profile, credential, or endpoint flags.
- Do not edit the locked launcher or its pinned workspace constants.
- Stop if the workspace preflight, file ownership, or permission check fails.
- Treat GraphQL variables as potentially sensitive user data; keep fields small.
