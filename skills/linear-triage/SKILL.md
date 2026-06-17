---
name: linear-triage
description: Analyze Current team Cycle Epics in Linear to determine cycle-scoped work priority, find ready issues, and understand blocking relationships. Use when needing to prioritize Linear tickets, find what to work on next, understand task dependencies, or check what's blocked or in progress.
user-invocable: true
---

# Linear Task Dependency Resolver

Builds a dependency graph from Linear issue blocking relations and outputs a prioritized work order scoped to the **Current** team's active cycle epics. Uses a bundled script that calls the Linear GraphQL API directly.

## Prerequisites

`LINEAR_API_KEY` must be set in the shell environment. Get one at: Linear Settings > API > Personal API keys.

## Usage

The script is at `scripts/linear-triage.mjs` relative to this skill file. Resolve the absolute path from this SKILL.md's location when running:

```bash
node <skill-dir>/scripts/linear-triage.mjs
```

The team is always **Current**. Do not ask the user to choose a team and do not run triage for any other team.

If the user specifies a project, pass it with `--project`; otherwise, run with no project flag to analyze all Current team cycle epics:

```bash
node <skill-dir>/scripts/linear-triage.mjs --project "<project name>"
```

### Options

| Flag | Description | Example |
|------|-------------|---------|
| `--project` | Optional project name/id filter; still restricted to Current team | `--project "Native Toolchain Migration"` |
| `--state` | Optional state name/type filter for debugging only; omit for next-work triage | `--state "Todo"` |
| `--format=json` | Machine-readable JSON output | For programmatic use |

No flags are required. `--team` is intentionally not part of normal usage; the script rejects any team other than `"Current"`.

## Reading the Output

The script resolves the authenticated user (API key owner), locks the team to **Current**, finds parent issues in status **Cycle Epics**, and scopes all recommendations to those cycle epics plus their descendants. Assignee data separates available work from claimed work.

The header prints the scope and the cycle epic identifiers. It then outputs seven sections:

1. **IN PROGRESS** — Cycle-scoped issues actively being worked on, with assignee, parent epic reference, and what cycle work they unblock.
2. **READY TO WORK** — Cycle-scoped unblocked issues split into three groups:
   - **Leaf issues** — Human-actionable work items. Pick from here. `ready-for-agent` issues are excluded and shown in AGENT QUEUE instead.
   - **Epics** — Parent/cycle epic containers with sub-issue progress (e.g., `2/5 done, 2 in progress`). Do not work on these directly — work on their sub-issues instead.
   - **Assigned to others** — Claimed by someone else. Do not recommend these.
3. **RECOMMENDED WORK ORDER** — Cycle-scoped topological sort. `>> READY` = human can start now. `>> AGENT` = sandcastle input. `>> TRIAGE` = needs triage first. `>> EPIC (progress)` = parent issue, work on sub-issues. `>> CLAIMED (Name)` = ready but assigned to someone else.
4. **EPIC BREAKDOWN** — Cycle epic → child hierarchy tree showing each cycle epic's sub-issues at all nesting levels (sub-issues of sub-issues, recursively), with status, assignee, and completion markers (`~>` edges, `✓` for done). Progress counts include all descendants, not just direct children.
5. **DEPENDENCY GRAPH** — Visual tree showing cycle-scoped blocking chains (`->` edges).
6. **AGENT QUEUE — sandcastle inputs** — Current-team Todo issues labeled `ready-for-agent`, with blocker status. Sandcastle picks these up on the next `/sandcastle-run`.
7. **TRIAGE QUEUE — needs human attention** — Current-team Triage count. These need human triage before humans or agents can work them.

### Reading the gates together

| Issue location | Who picks it up |
|---|---|
| Triage state | Human triager — needs review first |
| Todo, no `ready-for-agent` label | Human implementer |
| Todo, `ready-for-agent` label | Sandcastle (autonomous) |
| Todo, `ready-for-human` label | Human implementer (explicitly triaged as not-AI-suitable) |
| In Review state | Human reviewer (PR open) |

## MANDATORY: Run the Script First

Before proposing, planning, or starting ANY work on Linear tickets, you MUST run the script and read its output. Do not plan work based on ticket titles or descriptions alone — the live Current-team cycle scope, dependency, assignee, and status data is the source of truth.

## Picking the Next Task

**Hard rules — never violate:**

1. **NEVER propose work outside the printed Cycle Epics scope.** Backlog/project issues outside those parent epics are not part of this cycle.
2. **NEVER propose work on IN PROGRESS issues.** Someone is already on them.
3. **NEVER propose work on DONE/CANCELED issues.**
4. **NEVER propose work marked `>> CLAIMED`** — someone else has dibs.
5. **NEVER propose work marked `>> AGENT`** to a human — it is already destined for sandcastle unless the user explicitly overrides.
6. **NEVER propose work marked `>> TRIAGE`** — it needs human triage before it is work-ready.
7. **NEVER propose working on an EPIC directly.** Items marked `>> EPIC` are parent issues — propose their unfinished sub-issues from the EPIC BREAKDOWN section instead.
8. **ONLY propose items marked `>> READY`** that are NOT in the IN PROGRESS section, NOT in the "Assigned to others" group, NOT in TRIAGE QUEUE, and NOT in AGENT QUEUE.
9. If every READY item is also in progress, claimed, triage, or agent-queued, tell the user — nothing new for a human to pick up.

**Prioritization (among eligible READY items):**

1. Treat priority as **relative only within the printed Cycle Epics scope**. Do not compare against issues outside the cycle.
2. Prefer issues that **unblock the most downstream cycle work** — critical path.
3. Within equal cycle unblock counts, pick higher priority (Urgent > High > Normal > Low > None).
4. Note which READY items can be worked **in parallel** (no mutual dependencies).

## Common Mistakes

- **Planning without running the script.** Always run it first — cycle scope, status, and dependencies change constantly.
- **Using the wrong team.** Triage is always Current team. Do not ask for or pass another team.
- **Comparing against backlog/project issues outside Cycle Epics.** Priorities are meaningful only inside the printed cycle scope.
- **Proposing in-progress work.** Check the IN PROGRESS section and exclude those issues.
- **Proposing claimed work.** Issues assigned to others are not available — check the "Assigned to others" subsection and exclude those too.
- **Proposing epic-level work.** Items in the "Epics" subsection are parent containers — propose their sub-issues from the EPIC BREAKDOWN section instead.
- **Recommending `ready-for-agent` issues to humans.** These belong to sandcastle and appear in AGENT QUEUE / `>> AGENT`, not READY TO WORK.
- **Ignoring Triage Queue.** A large triage queue means intake may be outpacing triage capacity even if READY looks small.
- **Missing the LINEAR_API_KEY.** If the script errors, help the user set the env var.
