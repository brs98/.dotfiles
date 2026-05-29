import assert from "node:assert/strict";
import test from "node:test";

import { buildRecoveryPlan } from "./recovery.mjs";

test("recovers one canonical unpublished branch per ready pebble", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/ricekit-394-fix-old",
        issueId: "ricekit-394",
        title: "Fix publish recovery",
        issueStatus: "ready_for_agent",
        ahead: 3,
        dirty: false,
        commitTime: 10,
      },
      {
        branch: "picastle/ricekit-394-fix-new",
        issueId: "ricekit-394",
        title: "Fix publish recovery",
        issueStatus: "ready_for_agent",
        ahead: 1,
        dirty: false,
        worktreePath: "/tmp/worktrees/ricekit-394-fix-new",
        commitTime: 20,
      },
    ],
    "ready_for_agent",
  );

  assert.deepEqual(plan.unpublishedBranches, [
    {
      id: "ricekit-394",
      title: "Fix publish recovery",
      branch: "picastle/ricekit-394-fix-old",
      worktreePath: undefined,
    },
  ]);
  assert.equal(plan.deferredBranches.length, 1);
  assert.match(plan.deferredBranches[0]!.reason, /duplicate local Picastle branch/);
  assert.equal(plan.blockedIssueIds.has("ricekit-394"), true);
});

test("does not publish duplicate local branches when the issue already has an open PR", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/ricekit-394-fix-local",
        issueId: "ricekit-394",
        title: "Fix publish recovery",
        issueStatus: "ready_for_agent",
        ahead: 2,
        dirty: false,
        commitTime: 20,
      },
      {
        branch: "picastle/ricekit-394-fix-published",
        issueId: "ricekit-394",
        title: "Fix publish recovery",
        issueStatus: "ready_for_agent",
        ahead: 3,
        dirty: false,
        openPrUrl: "https://github.com/example/repo/pull/42",
        commitTime: 10,
      },
    ],
    "ready_for_agent",
  );

  assert.deepEqual(plan.unpublishedBranches, []);
  assert.deepEqual(plan.alreadyPublished, [
    {
      id: "ricekit-394",
      title: "Fix publish recovery",
      branch: "picastle/ricekit-394-fix-published",
      worktreePath: undefined,
      prUrl: "https://github.com/example/repo/pull/42",
    },
  ]);
  assert.equal(plan.deferredBranches.length, 1);
  assert.match(plan.deferredBranches[0]!.reason, /already has an open PR/);
  assert.equal(plan.blockedIssueIds.has("ricekit-394"), true);
});

test("routes dirty ready worktrees back through implementation before publish", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/dotfiles-yi5-resumable-idempotent-runs",
        issueId: "dotfiles-yi5",
        title: "Make runs resumable",
        issueStatus: "ready_for_agent",
        ahead: 0,
        dirty: true,
        worktreePath: "/tmp/worktrees/dotfiles-yi5-resumable-idempotent-runs",
      },
    ],
    "ready_for_agent",
  );

  assert.deepEqual(plan.interruptedImplementations, [
    {
      id: "dotfiles-yi5",
      title: "Make runs resumable",
      branch: "picastle/dotfiles-yi5-resumable-idempotent-runs",
      worktreePath: "/tmp/worktrees/dotfiles-yi5-resumable-idempotent-runs",
    },
  ]);
  assert.deepEqual(plan.unpublishedBranches, []);
});

test("recognizes already-published and zero-ahead branches explicitly", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/ricekit-ymo-fix",
        issueId: "ricekit-ymo",
        title: "Already has PR",
        issueStatus: "ready_for_agent",
        ahead: 2,
        dirty: false,
        openPrUrl: "https://github.com/example/repo/pull/12",
      },
      {
        branch: "picastle/ricekit-000-clean",
        issueId: "ricekit-000",
        title: "Clean local branch",
        issueStatus: "ready_for_agent",
        ahead: 0,
        dirty: false,
      },
    ],
    "ready_for_agent",
  );

  assert.deepEqual(plan.alreadyPublished, [
    {
      id: "ricekit-ymo",
      title: "Already has PR",
      branch: "picastle/ricekit-ymo-fix",
      worktreePath: undefined,
      prUrl: "https://github.com/example/repo/pull/12",
    },
  ]);
  assert.equal(plan.ignoredBranches.length, 1);
  assert.equal(plan.ignoredBranches[0]!.reason, "zero commits ahead of base and clean");
  assert.equal(plan.blockedIssueIds.has("ricekit-ymo"), true);
});
