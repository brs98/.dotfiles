---
name: linear-fluid-commerce
description: Use when reading, searching, creating, updating, or commenting on issues in the Fluid Commerce Linear workspace, or when the user mentions Fluid Commerce Linear work.
---

# Fluid Commerce Linear

## Required entry point

Always use the workspace-locked launcher for Fluid Commerce operations:

```bash
FLUID_LINEAR=~/.agents/skills/linear-fluid-commerce
node "$FLUID_LINEAR/scripts/linear-fluid-commerce-gql.mjs" <query.graphql> [options]
```

The launcher is pinned in code to Fluid Commerce's organization UUID, URL key, and credential path. Before every requested operation, it verifies both organization identifiers using the same credential. It has no workspace selector and always returns verified workspace metadata.

For Fluid Commerce work, never use the generic transport, raw HTTP or `curl`, a Linear MCP tool, `linear-triage`'s ambient-key transport, or an ambient `LINEAR_API_KEY`. A valid credential for another workspace must fail before the requested query or mutation runs.

## Workflow

1. Use operations from `~/.agents/skills/linear-graphql/operations/`.
2. Resolve workspace-local team, state, label, project, and user IDs with targeted operations. Follow `pageInfo`; never copy IDs from another workspace or guess an ID from a display name.
3. If more than one team matches the request, ask the user which team to use.
4. Pass user data through `--variables` or a mode-`0600` `--variables-file`; never interpolate it into GraphQL.
5. Before a mutation, state the intended Fluid Commerce change.
6. After every operation, require the response envelope to report organization ID `54014601-3568-41d9-bc77-384a8559283d` and URL key `fluid-commerce`. For mutations, also report the returned issue identifier or comment ID and URL.

See [REFERENCE.md](REFERENCE.md) for common commands. Use a minimal custom GraphQL document only when the shared catalog lacks the required operation.

## Safety

- Only the locked launcher may load `~/.config/linear/workspaces/fluid-commerce.env`; never inspect, print, copy, source, or export that credential manually.
- Never add profile, workspace, credential, endpoint, or guard-bypass flags. `--profile` is forbidden by the launcher.
- Stop if the workspace preflight, credential ownership, permission, or symlink check fails.
- Treat GraphQL variables and Linear responses as potentially sensitive; request and display only fields needed for the task.
- The launcher locks the organization, not a team. Continue resolving and verifying the intended team inside Fluid Commerce.
