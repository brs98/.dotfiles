# Issue Management Reference

Set these non-secret paths for shorter commands:

```bash
DEVX=~/.agents/skills/linear-devxperience
OPS=~/.agents/skills/linear-graphql/operations
CLI="$DEVX/scripts/linear-devxperience-gql.mjs"
```

Verify identity or discover workspace IDs with targeted, paginated operations:

```bash
node "$CLI" "$OPS/whoami.graphql" --pretty
node "$CLI" "$OPS/teams.graphql"
node "$CLI" "$OPS/team-states.graphql" --variables '{"teamId":"team-uuid"}'
node "$CLI" "$OPS/labels.graphql"
node "$CLI" "$OPS/projects.graphql"
node "$CLI" "$OPS/users.graphql"
```

Read or search issues:

```bash
node "$CLI" "$OPS/issue.graphql" --variables '{"id":"DEV-123"}'
node "$CLI" "$OPS/issues.graphql" --variables \
  '{"first":10,"filter":{"title":{"containsIgnoreCase":"checkout"}}}'
```

Create or update an issue using resolved UUIDs:

```bash
node "$CLI" "$OPS/issue-create.graphql" --variables-file /tmp/issue-input.json
node "$CLI" "$OPS/issue-update.graphql" --variables \
  '{"id":"DEV-123","input":{"title":"Revised title"}}'
```

Create input shape:

```json
{
  "input": {
    "teamId": "team-uuid",
    "title": "Issue title",
    "description": "Markdown description"
  }
}
```

Read or add comments:

```bash
node "$CLI" "$OPS/comments.graphql" --variables '{"issueId":"DEV-123"}'
node "$CLI" "$OPS/comment-create.graphql" --variables \
  '{"input":{"issueId":"issue-uuid","body":"Comment body"}}'
```

The locked launcher always includes verified workspace identity. It emits compact
JSON by default; add `--pretty` only for human review. Prefer inline variables;
when a file is necessary, keep it mode `0600` and remove it after the operation.
Responses have the shape `{"workspace": {...}, "data": {...}}`; GraphQL fields,
pagination cursors, and mutation success values are nested under `data`.
