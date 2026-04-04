# Destination Options

After content is ready, ask the user:

> Where would you like to save these?
> 1. **Local** — markdown files
> 2. **GitHub** — GitHub issues
> 3. **Linear** — Linear issues

**Batch note**: Use the same destination for all issues. If the user picks Linear, ask for the team once and reuse it for every issue.

## Local

Save each issue to `./plans/<slug>.md` (create dir if needed). Kebab-case filename from title. Print file paths when done.

## GitHub

Create each with `gh issue create` using `--title` and `--body`. Create in dependency order so you can reference real issue numbers. Print all issue URLs when done.

## Linear

1. Ask which **team** (list with `mcp__plugin_linear_linear__list_teams` if unsure) — ask once, reuse for all issues
2. Create each with `mcp__plugin_linear_linear__save_issue` (title, team, description as markdown)
3. Print all issue identifiers when done
