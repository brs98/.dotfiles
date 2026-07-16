---
name: write-factory-ticket
description: Creates and validates factory-ready software tickets that specify why and what while leaving implementation choices open. Use when drafting, refining, checking, publishing, or preparing bugs, features, refactors, and migrations for autonomous agents.
---

# Write Factory Ticket

Turn an intent into an independently implementable, reviewable outcome contract. Use Relay as the source of truth for structure and this workflow for semantic readiness.

Read [references/framework.md](references/framework.md) before drafting.

## Workflow

1. Determine whether the user wants a draft, validation, tracker publication, or explicit Relay handoff. Creating a ticket does not authorize execution.
2. Classify the work as `bug`, `feature`, `refactor`, or `migration`. If several outcomes are independently valuable, split them into separate tickets.
3. Gather relevant facts from the conversation, tracker, linked decisions, and repository. Ask one focused question when an unresolved choice could materially change acceptance, scope, safety, or product behavior. Do not invent that choice.
4. Start from the current Relay template:

   ```bash
   relay ticket template --type <bug|feature|refactor|migration>
   ```

   If the executable is unavailable, retain the canonical `## Why` and `## What` headings and report that machine validation is unavailable. Do not recreate a second validator.

5. Draft the outcome contract:
   - Explain the problem, affected party or system, impact, and evidence under `Why`.
   - Define observable outcomes, acceptance examples, boundaries, constraints, dependencies, and resolved questions under `What`.
   - Preserve binding decisions and constraints. Put diagnostic clues or repository observations in known context and mark them non-binding unless authoritative.
   - Leave speculative files, classes, algorithms, libraries, and implementation sequences to the implementing agent. Never add a `## How` section.
6. Apply the semantic readiness rubric in the reference. A structurally valid ticket can still be semantically incomplete.
7. Save the draft to a temporary Markdown file and run:

   ```bash
   relay ticket check --file <draft.md> --type <type> --json
   ```

   Treat a nonzero status or `needs-info` result as not ready. This check proves structural readiness only.

8. If the user asked to publish, use the applicable workspace-locked issue-tracker skill. Preserve the validated Markdown and relevant route/type metadata. If publication was not requested, return the draft without mutating a tracker.
9. Apply Relay's configured execution gate only when the user explicitly asks to enqueue, delegate, hand off, or run the ticket, and only after both semantic review and Relay validation pass. Resolve the gate from project configuration; never guess it.

## Output

For drafts, return the title, type, complete ticket Markdown, validation result, and any remaining blocker. For tracker mutations, also return the issue identifier/link and state whether the execution gate was applied. Never describe a merely published ticket as queued.
