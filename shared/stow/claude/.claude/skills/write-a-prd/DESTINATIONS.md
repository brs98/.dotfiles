# Destination Options

After content is ready, ask the user:

> Where would you like to save this?
> 1. **Local** — markdown file
> 2. **GitHub** — GitHub issue
> 3. **Linear** — Linear issue

## Local

Save to `./plans/<slug>.md` (create dir if needed). Kebab-case filename from title. Print file path when done.

## GitHub

Create with `gh issue create` using `--title` and `--body`. Print issue URL when done.

## Linear

1. Ask which **team** (list with `mcp__plugin_linear_linear__list_teams` if unsure)
2. Create with `mcp__plugin_linear_linear__save_issue` (title, team, description as markdown)
3. Print the issue identifier when done
