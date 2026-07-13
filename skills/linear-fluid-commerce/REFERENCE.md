# Fluid Commerce Linear Reference

Set these non-secret paths for shorter commands:

```bash
FLUID_LINEAR=~/.agents/skills/linear-fluid-commerce
OPS=~/.agents/skills/linear-graphql/operations
CLI="$FLUID_LINEAR/scripts/linear-fluid-commerce-gql.mjs"
```

Verify identity and resolve workspace-local IDs:

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
node "$CLI" "$OPS/issue.graphql" --variables '{"id":"CURRENT-123"}'
node "$CLI" "$OPS/issues.graphql" --variables \
  '{"first":10,"filter":{"title":{"containsIgnoreCase":"checkout"}}}'
```

Create or update an issue using previously resolved UUIDs. For a variables file, create a unique mode-`0600` temporary file, populate it with a trusted editor or file-writing tool, and remove it immediately after the operation:

```bash
variables_file=$(mktemp "${TMPDIR:-/tmp}/fluid-linear-variables.XXXXXX")
chmod 600 "$variables_file"
# Write the JSON input to "$variables_file" without printing it.
node "$CLI" "$OPS/issue-create.graphql" --variables-file "$variables_file"
rm -f "$variables_file"

node "$CLI" "$OPS/issue-update.graphql" --variables \
  '{"id":"CURRENT-123","input":{"title":"Revised title"}}'
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
node "$CLI" "$OPS/comments.graphql" --variables '{"issueId":"CURRENT-123"}'
node "$CLI" "$OPS/comment-create.graphql" --variables \
  '{"input":{"issueId":"issue-uuid","body":"Comment body"}}'
```

Responses always have the shape `{"workspace": {...}, "data": {...}}`. Require the workspace ID and URL key documented in `SKILL.md` before trusting `data`. Follow pagination cursors and keep requested fields and variables minimal.
