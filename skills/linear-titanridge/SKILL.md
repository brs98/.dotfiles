---
name: linear-titanridge
description: Provides workspace-locked Linear issue operations for TitanRidge. Use when reading, searching, creating, updating, or commenting on issues in the TitanRidge Linear workspace, or when the user mentions TitanRidge Linear work.
---

# TitanRidge Linear

## Required entry point

Always use the workspace-locked launcher for TitanRidge operations:

```bash
TITANRIDGE_LINEAR=~/.agents/skills/linear-titanridge
node "$TITANRIDGE_LINEAR/scripts/linear-titanridge-gql.mjs" <query.graphql> [options]
```

The launcher is pinned in code to TitanRidge's organization UUID, URL key, and
credential path. Before every requested operation, it verifies both organization
identifiers using the same credential. It has no workspace selector and always
returns verified workspace metadata.

For TitanRidge work, never use the generic transport, raw HTTP or `curl`, a
Linear MCP tool, or an ambient `LINEAR_API_KEY`. A credential for another
workspace must fail before the requested query or mutation runs.

## Workflow

1. Use operations from `~/.agents/skills/linear-graphql/operations/`.
2. Resolve workspace-local team, state, label, project, and user IDs with
   targeted operations. Follow `pageInfo`; never copy IDs from another workspace
   or guess an ID from a display name.
3. If more than one team matches the request, ask the user which team to use.
4. Pass user data through `--variables` or a mode-`0600` `--variables-file`;
   never interpolate it into GraphQL.
5. Before a mutation, state the intended TitanRidge change.
6. After every operation, require the response envelope to report organization
   ID `9aba26bc-bd01-4206-b2ef-d6087e7b386e` and URL key `titanridge`. For
   mutations, also report the returned issue identifier or comment ID and URL.

See [REFERENCE.md](REFERENCE.md) for common commands. Use a minimal custom
GraphQL document only when the shared catalog lacks the required operation.

## Safety

- Only the locked launcher may load `~/.config/linear/workspaces/titanridge.env`;
  never inspect, print, copy, source, or export that credential manually.
- Never add profile, workspace, credential, endpoint, or guard-bypass flags.
  `--profile` is forbidden by the launcher.
- Stop if the workspace preflight, credential ownership, permission, or symlink
  check fails.
- Treat GraphQL variables and Linear responses as potentially sensitive;
  request and display only fields needed for the task.
- The launcher locks the organization, not a team. Continue resolving and
  verifying the intended team inside TitanRidge.
