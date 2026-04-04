---
name: linear-deps
description: Analyze blocking relationships between Linear issues to determine work priority, find what's ready, and identify parallel work opportunities. Use when needing to prioritize Linear tickets, find what to work on next, understand task dependencies, or check what's blocked or in progress for a project or team.
---

# Linear Task Dependency Resolver

Builds a dependency graph from Linear issue blocking relations and outputs a prioritized work order. Uses a bundled script that calls the Linear GraphQL API directly — one query fetches everything.

## Prerequisites

`LINEAR_API_KEY` must be set in the shell environment. Get one at: Linear Settings > API > Personal API keys.

## Usage

The script is at `scripts/linear-deps.mjs` relative to this skill file. Resolve the absolute path from this SKILL.md's location when running:

```bash
node <skill-dir>/scripts/linear-deps.mjs --project "<project name>"
```

If the user doesn't specify a project or team, use the Linear MCP to help them choose:
- `list_projects` — shows available projects
- `list_teams` — shows available teams

Then run the script with their choice.

### Options

| Flag | Description | Example |
|------|-------------|---------|
| `--project` | Filter by project name (fuzzy match) | `--project "Native Toolchain Migration"` |
| `--team` | Filter by team name | `--team "Rep Experience"` |
| `--state` | Filter by state type (comma-separated) | `--state "unstarted,started"` |
| `--format=json` | Machine-readable JSON output | For programmatic use |

At least `--project` or `--team` is required.

## Reading the Output

The script outputs four sections:

1. **IN PROGRESS** — Issues actively being worked on, with assignee and what they unblock.
2. **READY TO WORK** — Unblocked issues sorted by priority. Pick from here.
3. **RECOMMENDED WORK ORDER** — Full topological sort. `>> READY` = can start now.
4. **DEPENDENCY GRAPH** — Visual tree showing blocking chains.

## MANDATORY: Run the Script First

Before proposing, planning, or starting ANY work on Linear tickets, you MUST run the script and read its output. Do not plan work based on ticket titles or descriptions alone — the live dependency and status data is the source of truth.

## Picking the Next Task

**Hard rules — never violate:**

1. **NEVER propose work on IN PROGRESS issues.** Someone is already on them.
2. **NEVER propose work on DONE/CANCELED issues.**
3. **ONLY propose items marked `>> READY`** that are NOT in the IN PROGRESS section.
4. If every READY item is also in progress, tell the user — nothing new to pick up.

**Prioritization (among eligible READY items):**

1. Prefer issues that **unblock the most downstream work** — critical path.
2. Within equal unblock counts, pick higher priority (Urgent > High > Normal > Low).
3. Note which READY items can be worked **in parallel** (no mutual dependencies).

## Common Mistakes

- **Planning without running the script.** Always run it first — status and dependencies change constantly.
- **Proposing in-progress work.** Check the IN PROGRESS section and exclude those issues.
- **Missing the LINEAR_API_KEY.** If the script errors, help the user set the env var.
