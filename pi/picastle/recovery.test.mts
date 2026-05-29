import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecoveryPlan,
  classifyPebShowFailure,
  extractIssueIdFromBranch,
  normalizeOpenPrsJson,
  parseFirstOpenPrUrl,
  parseOpenPrsByHead,
  type RecoveryBranchInput,
} from "./recovery.mjs";

test("extracts pebble ids before realistic branch slugs during recovery", () => {
  assert.equal(extractIssueIdFromBranch("picastle/ricekit-394-fix-old"), "ricekit-394");
  assert.equal(extractIssueIdFromBranch("picastle/dotfiles-yi5-resumable-idempotent-runs"), "dotfiles-yi5");

  const issuesById = new Map([
    ["ricekit-394", { title: "Fix publish recovery", status: "ready_for_agent" }],
    ["dotfiles-yi5", { title: "Make runs resumable", status: "ready_for_agent" }],
  ]);
  const collected = [
    { branch: "picastle/ricekit-394-fix-old", ahead: 3, dirty: false, commitTime: 10 },
    { branch: "picastle/ricekit-394-fix-new", ahead: 1, dirty: false, commitTime: 20 },
    { branch: "picastle/dotfiles-yi5-resumable-idempotent-runs", ahead: 0, dirty: true, worktreePath: "/tmp/worktrees/dotfiles-yi5-resumable-idempotent-runs" },
  ].map((branch): RecoveryBranchInput => {
    const issueId = extractIssueIdFromBranch(branch.branch);
    const issue = issueId ? issuesById.get(issueId) : undefined;
    return {
      ...branch,
      issueId,
      title: issue?.title,
      issueStatus: issue?.status,
    };
  });

  const plan = buildRecoveryPlan(collected, "ready_for_agent");

  assert.deepEqual(plan.unpublishedBranches.map((issue) => issue.id), ["ricekit-394"]);
  assert.deepEqual(plan.interruptedImplementations.map((issue) => issue.id), ["dotfiles-yi5"]);
  assert.equal(plan.deferredBranches.length, 1);
  assert.equal(plan.blockedIssueIds.has("ricekit-394"), true);
  assert.equal(plan.blockedIssueIds.has("dotfiles-yi5"), true);
  assert.equal(plan.blockedIssueIds.has("ricekit-394-fix"), false);
  assert.equal(plan.blockedIssueIds.has("dotfiles-yi5-resumable-idempotent"), false);
});

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

test("keeps lookup failures distinct from confirmed missing pebbles", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/dotfiles-yi5-resumable-idempotent-runs",
        issueId: "dotfiles-yi5",
        ahead: 1,
        dirty: false,
        issueLookup: { state: "failed", message: "database is locked" },
      },
      {
        branch: "picastle/dotfiles-zzz-missing",
        issueId: "dotfiles-zzz",
        ahead: 1,
        dirty: false,
        issueLookup: { state: "not_found", message: "not found" },
      },
    ],
    "ready_for_agent",
  );

  assert.deepEqual(
    plan.deferredBranches.map((branch) => [branch.issueId, branch.reason]),
    [
      ["dotfiles-yi5", "pebble lookup failed: database is locked"],
      ["dotfiles-zzz", "pebble was not found"],
    ],
  );
});

test("fails closed on malformed open PR discovery JSON", () => {
  assert.throws(() => parseOpenPrsByHead(""), /empty output/);
  assert.throws(() => parseOpenPrsByHead("not json"), /failed to parse gh pr list JSON/);
  assert.throws(() => normalizeOpenPrsJson('{"headRefName":"branch"}'), /expected an array/);
  assert.throws(() => parseOpenPrsByHead('[{"headRefName":"picastle/x"}]'), /invalid url/);
});

test("parses open PR discovery output for recovery and publish probes", () => {
  const stdout = JSON.stringify([
    { number: 12, headRefName: "picastle/dotfiles-yi5-resumable-idempotent-runs", url: "https://github.com/acme/repo/pull/12" },
  ]);

  assert.equal(
    parseOpenPrsByHead(stdout).get("picastle/dotfiles-yi5-resumable-idempotent-runs"),
    "https://github.com/acme/repo/pull/12",
  );
  assert.equal(parseFirstOpenPrUrl(stdout), "https://github.com/acme/repo/pull/12");
  assert.equal(normalizeOpenPrsJson(stdout), stdout);
});

test("classifies peb show failures without collapsing them all to not-found", () => {
  assert.equal(classifyPebShowFailure("issue dotfiles-yi5 not found").state, "not_found");
  assert.deepEqual(classifyPebShowFailure("database is locked"), { state: "failed", message: "database is locked" });
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
