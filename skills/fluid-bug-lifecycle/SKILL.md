---
name: fluid-bug-lifecycle
description: Runs a Fluid bug from evidence-backed reproduction through challenge-site reporting, Fluid Commerce Linear tracking, a tested fix, PR review, and gated merge. Use when Brandon finds or reports a Fluid frontend, backend, API, integration, or cross-system bug and wants the complete bug lifecycle handled.
---

# Fluid Bug Lifecycle

## Quick start

- `$fluid-bug-lifecycle assess <bug>` is read-only and produces a reproduction packet and routing plan.
- `$fluid-bug-lifecycle run <bug>` authorizes the scoped external mutations in this workflow for one concrete bug.
- A vague observation defaults to `assess`. Never submit a synthetic, placeholder, or unconfirmed bug.
- The challenge-site submitter is exactly `Brandon Southwick`.
- Process distinct bugs separately: one canonical packet, Linear issue, challenge report, workspace,
  and PR per independently shippable defect.

Read [REFERENCE.md](REFERENCE.md) before a `run`.

## Required composition

Use these installed skills instead of reimplementing them:

- `agent-browser` for reproduction evidence and the challenge form.
- `linear-fluid-commerce` for every Linear operation.
- `firefighting` for assessment, confidence, stop conditions, and narrow TDD fixes.
- Applicable repository TypeScript, React, Jest, architecture, and local `AGENTS.md` guidance.
- `ship-pr` only for commit/push/PR creation; this wrapper owns `greploop`, Committee,
  `check-pr`, and merge sequencing.

This wrapper's explicitly authorized merge gate overrides only `firefighting`'s no-auto-merge
rule. All other firefighting safety gates remain in force.

## Workflow

1. **Discover and reproduce**
   - Capture URL, environment/build, expected and actual behavior, exact steps, impact, and minimal redacted evidence.
   - Reproduce twice when safe; use a failing automated test when feasible.
   - Stop destructive, privacy-sensitive, payment, auth, security, or production-data experiments.
2. **Deduplicate**
   - Search Fluid Linear and the visible challenge list before creating anything.
   - Resume the existing record when it is the same bug; stop on an active owner or open PR.
3. **Create the Linear bug**
   - Resolve the Fluid team, workflow state, `bug` label, and AI-state labels at runtime; never guess IDs.
   - If more than one team fits, ask Brandon. Create a structured issue with `bug` and `ai:triaging`.
   - Record challenge submitter metadata as `Brandon Southwick`; do not infer Linear identity from it.
4. **Submit the challenge report**
   - Discover the live form schema dynamically. Fill it from the canonical bug packet and include the Linear URL when supported.
   - Read every field back. The reporter must read exactly `Brandon Southwick`.
   - Click the final submit control once; verify an explicit success signal and save the report ID/URL to Linear.
5. **Assess and fix**
   - Post the Firefighting Assessment before code changes.
   - Implement only at confidence `>= 0.85` with no stop condition; otherwise mark `ai:needs-human` and pause.
   - Move to `ai:in-progress`, create an isolated Git worktree, prove the defect, make the narrow fix, and run scoped plus required checks.
6. **Open the PR**
   - Use a conventional title and a body linking Linear and the challenge report, with root cause, fix, impact, and commands actually run.
   - Move the Linear marker to `ai:pr-opened` and comment with the PR URL.
7. **Review**
   - Run Greploop to the latest-head `5/5` with zero unresolved Greptile comments.
   - Only then request `@fluid-commerce/reviewer-committee`.
   - Run `check-pr`; `run` authorizes unambiguous in-scope feedback fixes. Restart both
     review gates after every push; pause for product or scope decisions.
8. **Merge and close**
   - Apply every merge gate below to one immutable head SHA.
   - Squash merge with a head-SHA guard, never `--admin`; honor a required merge queue and monitor until actually merged.
   - Comment the merge SHA and final verification in Linear, remove AI-state labels, and move the issue to its resolved team state.

## Non-negotiable merge gate

Merge only when all are true for the current head SHA:

- Challenge report and Linear bug exist; Linear records the report ID/URL, and the report links
  Linear when the form supports it.
- Required CI checks pass and the PR is non-draft, mergeable, and branch protection is satisfied.
- Latest Greptile result is `5/5` with zero unresolved Greptile comments.
- Reviewer Committee has an explicit positive approval attributable to this SHA.
- No `CHANGES_REQUESTED` or unresolved actionable thread remains; require native `APPROVED`
  only when branch protection or repository review rules require it.
- No stop condition, newer commit, changed base, or ambiguous external result invalidates the evidence.

Absence of feedback is not approval. If the committee's approval artifact cannot be identified
unambiguously, pause for Brandon rather than guessing. Never enable unattended auto-merge.

## Final report

Return the challenge report, Linear issue, PR, merge SHA, reproduction evidence, root cause,
verification commands/results, review iterations, and any paused gate. Never claim success from
an ambiguous timeout or partial external response.
