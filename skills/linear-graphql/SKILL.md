---
name: linear-graphql
description: Use when maintaining a workspace-locked Linear integration or when raw Linear GraphQL transport behavior must be inspected. Do not use directly for workspace issue operations when a locked workspace skill exists.
---

# Linear GraphQL Transport

## Purpose

This is the workspace-neutral transport behind locked Linear workspace skills.
For user work, load the workspace-specific skill and use its launcher.

The transport requires an explicit profile, verifies the authenticated
organization before every operation, and then executes one GraphQL document.
It never reads ambient API-key variables or accepts an endpoint override.

## Generic Invocation

```bash
node ~/.agents/skills/linear-graphql/scripts/linear-gql.mjs \
  --profile <trusted-profile.json> <query.graphql> \
  --variables '{"id":"ISSUE-1"}'
```

Run `--help` for flags. Prefer compact output and request only needed fields.
Use `--envelope` when verified workspace metadata is required in the response.

## Safety Rules

- Never use the generic entrypoint when a locked workspace skill exists.
- Never pass credentials through arguments, stdin, or ambient variables.
- Never add an endpoint override or skip the organization preflight.
- Store credentials only in the profile's permission-restricted dotenv file.
- Use GraphQL variables for user data; do not interpolate values into queries.
