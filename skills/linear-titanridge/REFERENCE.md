# TitanRidge Linear Reference

Set these non-secret paths for shorter commands:

```bash
TITANRIDGE_LINEAR=~/.agents/skills/linear-titanridge
OPS=~/.agents/skills/linear-graphql/operations
CLI="$TITANRIDGE_LINEAR/scripts/linear-titanridge-gql.mjs"
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

Create or update an issue using previously resolved UUIDs. For a variables file,
create a unique mode-`0600` temporary file, populate it without printing its
contents, and remove it immediately after the operation:

```bash
variables_file=$(mktemp "${TMPDIR:-/tmp}/titanridge-linear-variables.XXXXXX")
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

Manage custom views with the shared catalog:

```bash
node "$CLI" "$OPS/custom-views.graphql" --variables \
  '{"filter":{"name":{"containsIgnoreCase":"triage"}}}'
node "$CLI" "$OPS/custom-view.graphql" --variables '{"id":"view-id-or-slug"}'
node "$CLI" "$OPS/custom-view-create.graphql" --variables \
  '{"input":{"name":"Triage queue","teamId":"team-uuid","filterData":{"state":{"name":{"eq":"Triage"}}},"shared":true}}'
node "$CLI" "$OPS/custom-view-update.graphql" --variables \
  '{"id":"view-id","input":{"name":"Revised view name"}}'
node "$CLI" "$OPS/custom-view-issues.graphql" --variables \
  '{"id":"view-id-or-slug","first":25}'
node "$CLI" "$OPS/custom-view-has-subscribers.graphql" --variables \
  '{"id":"view-id"}'
node "$CLI" "$OPS/custom-view-delete.graphql" --variables '{"id":"view-id"}'
```

`custom-views.graphql` excludes views scoped directly to a project or initiative;
use `custom-view.graphql` with a known UUID or slug for those. Before deleting a
custom view, fetch it, check subscribers, state the intended deletion, and get
explicit user confirmation. Follow `pageInfo` for pagination. Pass
`"includeSubTeams":true` to `custom-view-issues.graphql` when appropriate.

Responses always have the shape `{"workspace": {...}, "data": {...}}`. Require
the workspace ID and URL key documented in `SKILL.md` before trusting `data`.
Keep requested fields and variables minimal.
