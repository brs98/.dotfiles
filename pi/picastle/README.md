# Picastle

Picastle is a Docker-free Sandcastle-style orchestrator powered by the Pi SDK.
It lives in dotfiles, runs from any git repo, uses host git worktrees, reads
Pebbles issues, and opens GitHub PRs for review.

## Install

```bash
npm --prefix ~/.dotfiles/pi/picastle install
```

Add to your shell config:

```bash
export PATH="$HOME/.dotfiles/pi/picastle/bin:$PATH"
```

## Run

From a target repository:

```bash
picastle
```

Remote Pebbles source-of-truth example:

```bash
PICASTLE_PEB_REMOTE=pi PICASTLE_PEB_REPO=ricekit picastle
```

Planner-only smoke test:

```bash
PICASTLE_PEB_REMOTE=pi PICASTLE_PEB_REPO=ricekit picastle --plan-only --max-iterations 1
```

## Policy support

Picastle reads `<repo>/pebbles-policy.json` when present. It derives:

- ready queue status from `ready-for-agent` / `ready_for_agent`
- pending follow-up status from `needs-triage` / `needs_triage`
- review status from `in-review` / `in_review`

Because some repos modeled workflow state as labels while newer Pebbles remotes use
normalized status values, Picastle queries both:

1. `peb list --status ready_for_agent`
2. `peb list --status open --label ready-for-agent` when that label appears in policy

Results are deduplicated by issue id.

## Runtime state

Runtime files are outside the target repo:

```txt
~/.cache/picastle/<safe-repo-path>/
  logs/
    picastle-planner-<iteration>-audit.json
  worktrees/
```

Planner audits record selected and skipped candidate issues with categories such
as `existing_pr`, `dependency`, `overlap_risk`, `missing_context`, and
`policy_status`. Console output also summarizes those reasons so an empty plan is
never just `issues: []` without explaining what Picastle considered.

Implementer worktrees may contain untracked `.picastle/pending-*.jsonl` manifests.
The host fan-in script applies those to Pebbles after each iteration.

## Useful knobs

- `PICASTLE_CONCURRENCY=3`
- `PICASTLE_MAX_ITERATIONS=10`
- `PICASTLE_MAX_ISSUES=0` max issues per planning cycle; `0` means no limit
- `PICASTLE_ISSUE_STATUS=ready_for_agent`
- `PICASTLE_ISSUE_LABEL=` optional extra label filter
- `PICASTLE_PENDING_STATUS=needs_triage`
- `PICASTLE_REVIEW_STATUS=in_review`
- `PICASTLE_VERIFY=1`
- `PICASTLE_PLAN_ONLY=1`
- `PICASTLE_PEB_REMOTE=pi`
- `PICASTLE_PEB_REPO=ricekit`
- `PICASTLE_PUSH=1`
- `PICASTLE_OPEN_PRS=1`
- `PICASTLE_PUBLISHER_AGENT=1` uses the review/repair/publish pipeline for Sandcastle parity
- `PICASTLE_REVIEW_REPAIR_CYCLES=10` max reviewer ↔ implementer repair loops
- `PICASTLE_REVIEW_CONCURRENCY=$PICASTLE_CONCURRENCY` parallel review/publish workers
- `PICASTLE_OPEN_PR_SCAN_LIMIT=1000` bounded `gh pr list` scan used to detect same-repository in-flight Picastle PRs and legacy Sandcastle PR heads; Picastle filters out fork/cross-repo heads and does not pass an unbounded "all PRs" list to recovery or planning
- `PICASTLE_WORKTREE_READY_COMMAND=` optional once-per-worktree setup command, e.g. `npm install`
- `PICASTLE_BEFORE_PUSH_COMMAND=` optional command run in the worktree immediately before `git push`
- `PICASTLE_CLEAN_TARGETS=1` deletes each Picastle worktree's `target/` after its publish/defer path finishes
- `PICASTLE_MIN_FREE_GB=40` refuses to start/continue an agent step when free disk drops below this threshold
- `PICASTLE_THINKING=high`


## Disk guardrails

For Rust repos where each isolated worktree can generate multi-GB build output,
prefer per-worktree isolation plus cleanup instead of a shared `CARGO_TARGET_DIR`:

```bash
PICASTLE_CLEAN_TARGETS=1 PICASTLE_MIN_FREE_GB=40 PICASTLE_CONCURRENCY=2 picastle
```

This keeps build artifacts isolated during implementation/review, then removes
only the generated `target/` directory from each Picastle runtime worktree after
that branch is published, blocked, or otherwise deferred. It never removes the
worktree itself, source changes, commits, PR bodies, or Picastle logs. The free
space threshold is checked before startup, each iteration, worktree setup hooks,
and Pi agent launches so Picastle stops before Pi hits an `ENOSPC` session/log
write.

## Resume behavior

At the start of each iteration, Picastle derives recovery state from Pebbles,
local `picastle/<issue>-*` branches, registered worktrees, and a bounded,
same-repository-filtered list of open Picastle/legacy Sandcastle PR heads before
it asks the planner for new work. Recovery is handled first:

- dirty branches are resumed through implementation only after their Pebble
  lookup is confirmed and the Pebble is still in the ready queue, so
  uncommitted work is not lost
- ahead-of-base ready-queue branches with confirmed lookup/readiness and no open
  PR are reviewed/published before planning
- orphan ready-queue local branches are attached to a runtime worktree before
  publishing
- clean open-PR branches with no unpushed commits have their Pebbles
  closure/review state reconciled only after the Pebble lookup succeeds and the
  Pebble is still in the ready queue
- dirty open-PR branches with confirmed ready-queue Pebbles are resumed through
  implementation; clean open-PR branches with unpushed commits are
  reviewed/published so the existing PR is updated
- zero-ahead/stale branches are summarized as ignored; duplicate, missing-pebble,
  lookup-failed, non-ready, and ambiguous/open-PR branches with recoverable work
  are deferred and block new planning for that Pebble instead of silently
  creating another branch

If recovery finds resumable local work, Picastle finishes that recovery pass and
restarts the loop rather than selecting new issues in the same iteration. This
keeps interrupted implement, review, push, and PR-creation phases idempotent.
