import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

process.env.PICASTLE_WORKTREE_READY_COMMAND = "";
process.env.PICASTLE_BEFORE_PUSH_COMMAND = "";

import {
  assertSafeRecoveryBranchName,
  buildRecoveryPlan,
  classifyPebShowFailure,
  decidePublishCommandBoundary,
  decidePublishFlow,
  extractIssueIdFromBranch,
  extractIssueIdFromOpenPrHead,
  filterCandidateIssuesWithoutOpenPrs,
  findOpenPrForIssue,
  isRecognizedRecoveryPrHead,
  normalizeOpenPrsJson,
  pebClosureRegistrationSucceeded,
  parseFirstOpenPrUrl,
  parseKnownIssueIdsJson,
  parseOpenPrsByHead,
  selectRecoveredUnpublishedBranches,
  selectRecoveryActions,
  validatePlannedIssueSelections,
  type RecoveryBranchInput,
} from "./recovery.mjs";
import type { StackMetadata } from "./stack.mjs";

test("extracts pebble ids before realistic branch slugs during recovery", () => {
  assert.equal(extractIssueIdFromBranch("picastle/ricekit-394-fix-old"), "ricekit-394");
  assert.equal(extractIssueIdFromBranch("picastle/dotfiles-yi5-resumable-idempotent-runs"), "dotfiles-yi5");
  assert.equal(extractIssueIdFromBranch("picastle/my-repo-abc-fix"), "my-repo-abc");
  assert.equal(extractIssueIdFromBranch("picastle/my-repo-abc-fix", ["my-repo", "my-repo-abc"]), "my-repo-abc");
  assert.equal(extractIssueIdFromBranch("picastle/web-api-abc-fix", ["web-api", "web-api-abc"]), "web-api-abc");
  assert.equal(extractIssueIdFromBranch("sandcastle/dotfiles-yi5-resumable-idempotent-runs"), "dotfiles-yi5");
  assert.equal(extractIssueIdFromBranch("sandcastle/web-api-abc-fix", ["web-api", "web-api-abc"]), "web-api-abc");

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

test("ignores malformed Picastle branch names without issue ids", () => {
  assert.equal(extractIssueIdFromBranch("ricekit-394-fix-old"), undefined);
  assert.equal(extractIssueIdFromBranch("picastle/ricekit-394"), undefined);
  assert.equal(extractIssueIdFromBranch("picastle/my-repo"), undefined);
  assert.equal(extractIssueIdFromBranch("picastle/my--repo-abc-fix"), undefined);
  assert.equal(extractIssueIdFromBranch("picastle/My-repo-abc-fix"), undefined);
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

test("reconciles only one clean ready open PR branch per pebble", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/ricekit-394-fix-old",
        issueId: "ricekit-394",
        title: "Fix publish recovery",
        issueStatus: "ready_for_agent",
        issueLookup: { state: "found" },
        ahead: 0,
        dirty: false,
        openPrUrl: "https://github.com/example/repo/pull/41",
      },
      {
        branch: "picastle/ricekit-394-fix-new",
        issueId: "ricekit-394",
        title: "Fix publish recovery",
        issueStatus: "ready_for_agent",
        issueLookup: { state: "found" },
        ahead: 0,
        dirty: false,
        openPrUrl: "https://github.com/example/repo/pull/42",
      },
    ],
    "ready_for_agent",
  );

  assert.deepEqual(plan.alreadyPublished, [
    {
      id: "ricekit-394",
      title: "Fix publish recovery",
      branch: "picastle/ricekit-394-fix-old",
      worktreePath: undefined,
      prUrl: "https://github.com/example/repo/pull/41",
    },
  ]);
  assert.deepEqual(selectRecoveryActions(plan), [
    { kind: "declare-pending-closure", issueId: "ricekit-394", prUrl: "https://github.com/example/repo/pull/41" },
  ]);
  assert.deepEqual(plan.unpublishedBranches, []);
  assert.equal(plan.ignoredBranches.length, 1);
  assert.equal(plan.ignoredBranches[0]!.branch, "picastle/ricekit-394-fix-new");
  assert.match(plan.ignoredBranches[0]!.reason, /already has an open PR on picastle\/ricekit-394-fix-old/);
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

test("resumes dirty ready branches even when they already have an open PR", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/dotfiles-yi5-resumable-idempotent-runs",
        issueId: "dotfiles-yi5",
        title: "Make runs resumable",
        issueStatus: "ready_for_agent",
        issueLookup: { state: "found" },
        ahead: 3,
        dirty: true,
        worktreePath: "/tmp/worktrees/dotfiles-yi5-resumable-idempotent-runs",
        openPrUrl: "https://github.com/example/repo/pull/12",
      },
    ],
    "ready_for_agent",
  );

  assert.deepEqual(plan.alreadyPublished, []);
  assert.deepEqual(plan.interruptedImplementations, [
    {
      id: "dotfiles-yi5",
      title: "Make runs resumable",
      branch: "picastle/dotfiles-yi5-resumable-idempotent-runs",
      worktreePath: "/tmp/worktrees/dotfiles-yi5-resumable-idempotent-runs",
    },
  ]);
  assert.deepEqual(plan.unpublishedBranches, []);
  assert.equal(plan.blockedIssueIds.has("dotfiles-yi5"), true);
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

test("routes same-branch open PRs with unpushed commits through publish/update", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/dotfiles-yi5-resumable-idempotent-runs",
        issueId: "dotfiles-yi5",
        title: "Make runs resumable",
        issueStatus: "ready_for_agent",
        issueLookup: { state: "found" },
        ahead: 3,
        unpushed: 2,
        dirty: false,
        worktreePath: "/tmp/worktrees/dotfiles-yi5-resumable-idempotent-runs",
        openPrUrl: "https://github.com/example/repo/pull/12",
      },
    ],
    "ready_for_agent",
  );

  assert.deepEqual(plan.alreadyPublished, []);
  assert.deepEqual(plan.unpublishedBranches, [
    {
      id: "dotfiles-yi5",
      title: "Make runs resumable",
      branch: "picastle/dotfiles-yi5-resumable-idempotent-runs",
      worktreePath: "/tmp/worktrees/dotfiles-yi5-resumable-idempotent-runs",
    },
  ]);
  assert.equal(plan.deferredBranches.length, 0);
  assert.equal(plan.blockedIssueIds.has("dotfiles-yi5"), true);
});

test("does not treat open PR branches as already published when pebble lookup is not confirmed", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/dotfiles-yi5-resumable-idempotent-runs",
        issueId: "dotfiles-yi5",
        ahead: 0,
        dirty: false,
        openPrUrl: "https://github.com/example/repo/pull/12",
        issueLookup: { state: "failed", message: "database is locked" },
      },
      {
        branch: "picastle/dotfiles-zzz-missing",
        issueId: "dotfiles-zzz",
        ahead: 1,
        dirty: false,
        openPrUrl: "https://github.com/example/repo/pull/13",
        issueLookup: { state: "not_found", message: "not found" },
      },
    ],
    "ready_for_agent",
  );

  assert.deepEqual(plan.alreadyPublished, []);
  assert.deepEqual(plan.ignoredBranches, []);
  assert.deepEqual(plan.deferredBranches.map((branch) => [branch.issueId, branch.reason]), [
    ["dotfiles-yi5", "pebble lookup failed: database is locked"],
    ["dotfiles-zzz", "pebble was not found"],
  ]);
  assert.equal(plan.blockedIssueIds.has("dotfiles-yi5"), true);
  assert.equal(plan.blockedIssueIds.has("dotfiles-zzz"), true);
});

test("recovery preserves persisted stack order instead of issue-id sort", () => {
  const stack = (index: number, issueId: string, headBranch: string, previousBranch?: string): StackMetadata => ({
    stackId: "dotfiles-zzz-dotfiles-aaa-dotfiles-mmm",
    index,
    total: 3,
    issueId,
    headBranch,
    baseBranch: "main",
    ...(previousBranch ? { previousBranch } : {}),
  });
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/dotfiles-aaa-second",
        issueId: "dotfiles-aaa",
        title: "Second in planner order",
        issueStatus: "ready_for_agent",
        ahead: 1,
        dirty: false,
        stack: stack(2, "dotfiles-aaa", "picastle/dotfiles-aaa-second", "picastle/dotfiles-zzz-first"),
      },
      {
        branch: "picastle/dotfiles-mmm-third",
        issueId: "dotfiles-mmm",
        title: "Third in planner order",
        issueStatus: "ready_for_agent",
        ahead: 1,
        dirty: false,
        stack: stack(3, "dotfiles-mmm", "picastle/dotfiles-mmm-third", "picastle/dotfiles-aaa-second"),
      },
      {
        branch: "picastle/dotfiles-zzz-first",
        issueId: "dotfiles-zzz",
        title: "First in planner order",
        issueStatus: "ready_for_agent",
        ahead: 1,
        dirty: false,
        stack: stack(1, "dotfiles-zzz", "picastle/dotfiles-zzz-first"),
      },
    ],
    "ready_for_agent",
  );

  assert.deepEqual(plan.unpublishedBranches.map((issue) => issue.id), ["dotfiles-zzz", "dotfiles-aaa", "dotfiles-mmm"]);
  assert.equal(plan.unpublishedBranches[1]!.stack?.previousBranch, "picastle/dotfiles-zzz-first");
});

test("recovery treats legacy open issues with the policy ready label as ready", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/dotfiles-aaa-existing-pr",
        issueId: "dotfiles-aaa",
        title: "Legacy label queue issue",
        issueStatus: "open",
        issueLabels: ["ready-for-agent"],
        issueLookup: { state: "found" },
        ahead: 0,
        dirty: false,
        openPrUrl: "https://github.com/example/repo/pull/42",
      },
    ],
    { status: "ready_for_agent", readyLabel: "ready-for-agent" },
  );

  assert.deepEqual(plan.alreadyPublished.map((issue) => issue.id), ["dotfiles-aaa"]);
  assert.deepEqual(plan.deferredBranches, []);
  assert.equal(plan.blockedIssueIds.has("dotfiles-aaa"), true);
});

test("recovery does not treat open issues without the policy ready label as ready", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/dotfiles-aaa-existing-pr",
        issueId: "dotfiles-aaa",
        title: "Legacy label queue issue",
        issueStatus: "open",
        issueLabels: ["other-label"],
        issueLookup: { state: "found" },
        ahead: 1,
        dirty: false,
        openPrUrl: "https://github.com/example/repo/pull/42",
      },
    ],
    { status: "ready_for_agent", readyLabel: "ready-for-agent" },
  );

  assert.deepEqual(plan.alreadyPublished, []);
  assert.deepEqual(plan.deferredBranches.map((branch) => [branch.issueId, branch.reason]), [
    ["dotfiles-aaa", "pebble status is open without ready label ready-for-agent"],
  ]);
});

test("recovery defers ready-label open PR branches that lack the required Picastle issue label", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/dotfiles-aaa-existing-pr",
        issueId: "dotfiles-aaa",
        title: "Legacy label queue issue",
        issueStatus: "open",
        issueLabels: ["ready-for-agent"],
        issueLookup: { state: "found" },
        ahead: 0,
        dirty: false,
        openPrUrl: "https://github.com/example/repo/pull/42",
      },
    ],
    { status: "ready_for_agent", readyLabel: "ready-for-agent", requiredLabel: "automation" },
  );

  assert.deepEqual(plan.alreadyPublished, []);
  assert.deepEqual(selectRecoveryActions(plan), []);
  assert.deepEqual(plan.deferredBranches.map((branch) => [branch.issueId, branch.reason]), [
    ["dotfiles-aaa", "pebble is missing required label automation"],
  ]);
  assert.equal(plan.blockedIssueIds.has("dotfiles-aaa"), true);
});

test("does not reconcile open PR branches for non-ready pebbles", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/dotfiles-yi5-resumable-idempotent-runs",
        issueId: "dotfiles-yi5",
        title: "Make runs resumable",
        issueStatus: "in_review",
        issueLookup: { state: "found" },
        ahead: 0,
        dirty: false,
        openPrUrl: "https://github.com/example/repo/pull/12",
      },
      {
        branch: "picastle/dotfiles-yi5-local-duplicate",
        issueId: "dotfiles-yi5",
        title: "Make runs resumable",
        issueStatus: "in_review",
        issueLookup: { state: "found" },
        ahead: 2,
        dirty: false,
      },
    ],
    "ready_for_agent",
  );

  assert.deepEqual(plan.alreadyPublished, []);
  assert.deepEqual(plan.ignoredBranches, []);
  assert.deepEqual(plan.deferredBranches.map((branch) => [branch.branch, branch.reason]), [
    ["picastle/dotfiles-yi5-local-duplicate", "pebble status is in_review, not ready_for_agent"],
    ["picastle/dotfiles-yi5-resumable-idempotent-runs", "pebble status is in_review, not ready_for_agent"],
  ]);
  assert.deepEqual(plan.unpublishedBranches, []);
});

test("parses known issue id discovery output deterministically", () => {
  assert.deepEqual(parseKnownIssueIdsJson(JSON.stringify({ data: [{ id: "my-repo" }, { id: "my-repo-abc" }, { id: "my-repo" }] })), [
    "my-repo-abc",
    "my-repo",
  ]);
  assert.deepEqual(parseKnownIssueIdsJson(JSON.stringify([{ id: "b-abc" }, { id: "a-abc" }])), ["a-abc", "b-abc"]);
});

test("fails closed on unsafe Picastle recovery branch names before command construction", () => {
  assert.doesNotThrow(() => assertSafeRecoveryBranchName("picastle/dotfiles-yi5-resumable-idempotent-runs"));
  assert.throws(() => assertSafeRecoveryBranchName("picastle/dotfiles-yi5-fix;echo-owned"), /unsafe Picastle recovery branch name/);
  assert.throws(() => assertSafeRecoveryBranchName("picastle/dotfiles-yi5-fix with-space"), /unsafe Picastle recovery branch name/);
  assert.throws(() => assertSafeRecoveryBranchName("picastle/dotfiles-yi5/extra"), /unsafe Picastle recovery branch name/);
  assert.throws(() => assertSafeRecoveryBranchName("picastle/dotfiles-yi5..fix"), /unsafe Picastle recovery branch name/);
});

test("fails closed on unsafe planner-selected branch names before worktree creation", () => {
  const candidates = [{ id: "dotfiles-aaa", title: "Allowed" }];
  for (const branch of [
    "picastle/dotfiles-aaa-fix;echo-owned",
    "picastle/dotfiles-aaa-fix with-space",
    "picastle/dotfiles-aaa/extra",
    "picastle/dotfiles-aaa..fix",
    "picastle/dotfiles-aaa-fix.lock",
  ]) {
    assert.throws(
      () => validatePlannedIssueSelections([{ id: "dotfiles-aaa", title: "Allowed", branch }], candidates),
      /unsafe Picastle recovery branch name/,
    );
  }
});

test("fails closed on malformed known issue id discovery JSON", () => {
  assert.throws(() => parseKnownIssueIdsJson(""), /empty output/);
  assert.throws(() => parseKnownIssueIdsJson("not json"), /failed to parse peb issue id query JSON/);
  assert.throws(() => parseKnownIssueIdsJson('{"id":"dotfiles-yi5"}'), /expected an array or an object with a data array/);
  assert.throws(() => parseKnownIssueIdsJson(JSON.stringify({ data: [{ title: "missing id" }] })), /invalid id/);
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

test("filters open PR discovery to same-repository heads when repository identity is supplied", () => {
  const currentRepository = { owner: "acme", name: "repo" };
  const stdout = JSON.stringify([
    {
      number: 11,
      headRefName: "picastle/dotfiles-yi5-resumable-idempotent-runs",
      url: "https://github.com/acme/repo/pull/11",
      isCrossRepository: true,
      headRepositoryOwner: { login: "fork" },
      headRepository: { name: "repo" },
    },
    {
      number: 12,
      headRefName: "picastle/dotfiles-yi5-resumable-idempotent-runs",
      url: "https://github.com/acme/repo/pull/12",
      isCrossRepository: false,
      headRepositoryOwner: { login: "acme" },
      headRepository: { name: "repo" },
    },
    {
      number: 13,
      headRefName: "picastle/dotfiles-bbb-other",
      url: "https://github.com/acme/repo/pull/13",
      headRepository: { nameWithOwner: "other/repo" },
    },
    {
      number: 14,
      headRefName: "feature/dotfiles-ccc-unrelated",
      url: "https://github.com/acme/repo/pull/14",
      isCrossRepository: false,
      headRepositoryOwner: { login: "acme" },
      headRepository: { name: "repo" },
    },
  ]);

  assert.deepEqual([...parseOpenPrsByHead(stdout, { currentRepository }).entries()], [
    ["picastle/dotfiles-yi5-resumable-idempotent-runs", "https://github.com/acme/repo/pull/12"],
  ]);
  assert.deepEqual(findOpenPrForIssue(stdout, "dotfiles-yi5", { currentRepository }), {
    number: 12,
    headRefName: "picastle/dotfiles-yi5-resumable-idempotent-runs",
    url: "https://github.com/acme/repo/pull/12",
    isCrossRepository: false,
    headRepositoryOwner: "acme",
    headRepositoryName: "repo",
  });
  assert.deepEqual(JSON.parse(normalizeOpenPrsJson(stdout, { currentRepository })).map((pr: { number: number }) => pr.number), [12]);
});

test("fails closed on ambiguous open PR head repository identity", () => {
  const stdout = JSON.stringify([
    {
      number: 12,
      headRefName: "picastle/dotfiles-yi5-resumable-idempotent-runs",
      url: "https://github.com/acme/repo/pull/12",
    },
  ]);

  assert.throws(
    () => parseOpenPrsByHead(stdout, { currentRepository: { owner: "acme", name: "repo" } }),
    /missing PR head repository identity/,
  );
});

test("finds existing open PRs by pebble id instead of exact branch only", () => {
  const stdout = JSON.stringify([
    { number: 10, headRefName: "picastle/my-repo-abc-other-work", url: "https://github.com/acme/repo/pull/10" },
    { number: 11, headRefName: "picastle/dotfiles-abc-other-work", url: "https://github.com/acme/repo/pull/11" },
    { number: 12, headRefName: "sandcastle/dotfiles-yi5-resumable-idempotent-runs", url: "https://github.com/acme/repo/pull/12" },
  ]);

  assert.deepEqual(findOpenPrForIssue(stdout, "dotfiles-yi5"), {
    number: 12,
    headRefName: "sandcastle/dotfiles-yi5-resumable-idempotent-runs",
    url: "https://github.com/acme/repo/pull/12",
  });
  assert.equal(findOpenPrForIssue(stdout, "dotfiles-xyz"), undefined);
  assert.equal(findOpenPrForIssue(stdout, "my-repo"), undefined);
});

test("open PR issue matching does not fabricate longer unknown ids and prefers longest known ids", () => {
  const stdout = JSON.stringify([
    { number: 20, headRefName: "picastle/web-api-abc-fix", url: "https://github.com/acme/repo/pull/20" },
  ]);
  const knownIssueIds = ["web-api", "web-api-abc"];

  assert.equal(extractIssueIdFromBranch("picastle/web-api-abc-fix"), "web-api");
  assert.equal(extractIssueIdFromBranch("picastle/web-api-abc-fix", knownIssueIds), "web-api-abc");
  assert.equal(extractIssueIdFromOpenPrHead("picastle/web-api-abc-fix", ["web-api"]), "web-api");
  assert.equal(findOpenPrForIssue(stdout, "web-api", { knownIssueIds: ["web-api"] })?.headRefName, "picastle/web-api-abc-fix");
  assert.equal(findOpenPrForIssue(stdout, "web-api", { knownIssueIds }), undefined);
  assert.deepEqual(findOpenPrForIssue(stdout, "web-api-abc", { knownIssueIds }), {
    number: 20,
    headRefName: "picastle/web-api-abc-fix",
    url: "https://github.com/acme/repo/pull/20",
  });
});

test("planner inputs resolve open PR issue ids from all known pebbles before filtering candidates", () => {
  const stdout = JSON.stringify([
    { number: 20, headRefName: "picastle/web-api-abc-fix", url: "https://github.com/acme/repo/pull/20" },
  ]);
  const knownIssueIds = ["web-api", "web-api-abc"];

  assert.deepEqual(JSON.parse(normalizeOpenPrsJson(stdout, { knownIssueIds })), [
    {
      number: 20,
      headRefName: "picastle/web-api-abc-fix",
      url: "https://github.com/acme/repo/pull/20",
      issueId: "web-api-abc",
    },
  ]);

  assert.deepEqual(
    filterCandidateIssuesWithoutOpenPrs(
      [{ id: "web-api", title: "Candidate short id" }],
      stdout,
      { knownIssueIds },
    ),
    [{ id: "web-api", title: "Candidate short id" }],
  );

  assert.deepEqual(
    filterCandidateIssuesWithoutOpenPrs(
      [
        { id: "web-api", title: "Candidate short id" },
        { id: "web-api-abc", title: "Candidate with existing PR" },
      ],
      stdout,
      { knownIssueIds },
    ),
    [{ id: "web-api", title: "Candidate short id" }],
  );
});

test("open PR issue matching keeps known shorter ids for three-token action slugs", () => {
  const cases = [
    { issueId: "dotfiles-yi5", headRefName: "picastle/dotfiles-yi5-fix-old" },
    { issueId: "dotfiles-yi5", headRefName: "picastle/dotfiles-yi5-add-tests" },
    { issueId: "ricekit-394", headRefName: "picastle/ricekit-394-cli-fix" },
  ];

  for (const { issueId, headRefName } of cases) {
    const stdout = JSON.stringify([{ number: 21, headRefName, url: "https://github.com/acme/repo/pull/21" }]);

    assert.equal(extractIssueIdFromOpenPrHead(headRefName, [issueId]), issueId);
    assert.equal(findOpenPrForIssue(stdout, issueId, { knownIssueIds: [issueId] })?.headRefName, headRefName);
  }
});

test("recognizes Picastle and legacy Sandcastle PR heads for recovery scans", () => {
  assert.equal(isRecognizedRecoveryPrHead("picastle/dotfiles-yi5-resumable-idempotent-runs"), true);
  assert.equal(isRecognizedRecoveryPrHead("sandcastle/dotfiles-yi5-resumable-idempotent-runs"), true);
  assert.equal(isRecognizedRecoveryPrHead("feature/dotfiles-yi5-resumable-idempotent-runs"), false);

  const plan = buildRecoveryPlan(
    [
      {
        branch: "sandcastle/dotfiles-yi5-resumable-idempotent-runs",
        issueId: "dotfiles-yi5",
        title: "Make runs resumable",
        issueStatus: "ready_for_agent",
        issueLookup: { state: "found" },
        ahead: 0,
        dirty: false,
        openPrUrl: "https://github.com/example/repo/pull/12",
      },
      {
        branch: "picastle/dotfiles-yi5-local-duplicate",
        issueId: "dotfiles-yi5",
        title: "Make runs resumable",
        issueStatus: "ready_for_agent",
        issueLookup: { state: "found" },
        ahead: 2,
        dirty: false,
      },
    ],
    "ready_for_agent",
  );

  assert.deepEqual(plan.alreadyPublished.map((issue) => issue.branch), ["sandcastle/dotfiles-yi5-resumable-idempotent-runs"]);
  assert.deepEqual(plan.unpublishedBranches, []);
  assert.equal(plan.deferredBranches[0]!.reason, "issue already has an open PR on sandcastle/dotfiles-yi5-resumable-idempotent-runs; not publishing duplicate");
});

test("plan-only runtime recovery scan is read-only and recognizes legacy Sandcastle same-repo PRs", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-plan-only-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);
  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  cat <<'JSON'
[
  {"number":4,"headRefName":"sandcastle/dotfiles-aaa-clean","url":"https://github.com/acme/repo/pull/4","isCrossRepository":true,"headRepositoryOwner":{"login":"fork"},"headRepository":{"name":"repo"}},
  {"number":5,"headRefName":"sandcastle/dotfiles-aaa-clean","url":"https://github.com/acme/repo/pull/5","isCrossRepository":false,"headRepositoryOwner":{"login":"acme"},"headRepository":{"name":"repo"}}
]
JSON
  exit 0
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$*" == *"show dotfiles-aaa"* ]]; then
  printf '%s\n' '{"data":{"title":"Already published","status":"ready_for_agent"}}'
  exit 0
fi
if [[ "$1" == "list" || "$*" == *" list "* ]]; then
  printf '%s\n' '{"data":[]}'
  exit 0
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--plan-only", "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
    },
  });

  assert.match(output, /PICASTLE_PLAN_ONLY=1; recovery scan is read-only\/log-only\./);
  assert.match(output, /published: dotfiles-aaa sandcastle\/dotfiles-aaa-clean → https:\/\/github\.com\/acme\/repo\/pull\/5/);
  assert.match(output, /No unblocked issues to work on\. Exiting\./);
  assert.match(readFileSync(ghLog, "utf8"), /pr list --state open --limit 1000 --json/);
  assert.doesNotMatch(readFileSync(pebLog, "utf8"), /\b(?:closes add|update)\b/);
});

test("runtime plan-only recovery treats open policy-label queue issues as ready", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-legacy-label-recovery-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  writeFileSync(join(repo, "pebbles-policy.json"), JSON.stringify({ groups: [{ name: "state", labels: ["ready-for-agent", "in-review"] }] }));
  execFileSync("git", ["add", "README.md", "pebbles-policy.json"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);

  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  cat <<'JSON'
[
  {"number":42,"headRefName":"picastle/dotfiles-aaa-existing-pr","url":"https://github.com/acme/repo/pull/42","isCrossRepository":false,"headRepositoryOwner":{"login":"acme"},"headRepository":{"name":"repo"}}
]
JSON
  exit 0
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then
  printf '%s\n' '{"data":[{"id":"dotfiles-aaa"}]}'
  exit 0
fi
if [[ "$1 $2" == "show dotfiles-aaa" ]]; then
  printf '%s\n' '{"data":{"title":"Legacy label ready","status":"open","labels":[{"name":"ready-for-agent"}]}}'
  exit 0
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--plan-only", "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
    },
  });

  assert.match(output, /published: dotfiles-aaa picastle\/dotfiles-aaa-existing-pr → https:\/\/github\.com\/acme\/repo\/pull\/42/);
  assert.doesNotMatch(readFileSync(pebLog, "utf8"), /\b(?:closes add|update)\b/);
});

test("mutable recovery defers ready-label open PR branches missing PICASTLE_ISSUE_LABEL without mutating pebbles", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-required-label-recovery-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  writeFileSync(join(repo, "pebbles-policy.json"), JSON.stringify({ groups: [{ name: "state", labels: ["ready-for-agent", "in-review"] }] }));
  execFileSync("git", ["add", "README.md", "pebbles-policy.json"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);

  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  cat <<'JSON'
[
  {"number":42,"headRefName":"picastle/dotfiles-aaa-existing-pr","url":"https://github.com/acme/repo/pull/42","isCrossRepository":false,"headRepositoryOwner":{"login":"acme"},"headRepository":{"name":"repo"}}
]
JSON
  exit 0
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then
  printf '%s\n' '{"data":[]}'
  exit 0
fi
if [[ "$1 $2" == "show dotfiles-aaa" ]]; then
  printf '%s\n' '{"data":{"title":"Needs automation label","status":"open","labels":[{"name":"ready-for-agent"}]}}'
  exit 0
fi
if [[ "$1 $2" == "closes add" || "$1" == "update" ]]; then
  echo "peb mutation should not be called for missing required label" >&2
  exit 2
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const result = spawnSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_ISSUE_LABEL: "automation",
      PICASTLE_TEST_AGENT_OUTPUT: '<plan>{"issues":[]}</plan>',
    },
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 0);
  assert.match(output, /defer: dotfiles-aaa picastle\/dotfiles-aaa-existing-pr: pebble is missing required label automation/);
  assert.doesNotMatch(output, /published: dotfiles-aaa/);
  const pebTrace = readFileSync(pebLog, "utf8");
  assert.doesNotMatch(pebTrace, /\b(?:closes add|update)\b/);
});

test("runtime planning includes legacy ready-label open issues with required label filtering and custom PR scan limit", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-legacy-label-planning-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  writeFileSync(join(repo, "pebbles-policy.json"), JSON.stringify({ groups: [{ name: "state", labels: ["ready-for-agent", "in-review"] }] }));
  execFileSync("git", ["add", "README.md", "pebbles-policy.json"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);

  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  printf '%s\n' '[]'
  exit 0
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$*" == "list --json" ]]; then
  printf '%s\n' '{"data":[{"id":"dotfiles-aaa"},{"id":"dotfiles-bbb"}]}'
  exit 0
fi
if [[ "$*" == "list --status ready_for_agent --label automation --json" ]]; then
  printf '%s\n' '{"data":[{"id":"dotfiles-aaa","title":"Ready status issue","description":"","status":"ready_for_agent","labels":["automation"],"comments":[],"dependencies":[]}]}'
  exit 0
fi
if [[ "$*" == "list --status open --label ready-for-agent --label automation --json" ]]; then
  printf '%s\n' '{"data":[{"id":"dotfiles-aaa","title":"Ready status issue duplicate","description":"","status":"open","labels":["ready-for-agent","automation"],"comments":[],"dependencies":[]},{"id":"dotfiles-bbb","title":"Legacy label issue","description":"","status":"open","labels":[{"name":"ready-for-agent"},{"name":"automation"}],"comments":[],"dependencies":[]}]}'
  exit 0
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--plan-only", "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_ISSUE_LABEL: "automation",
      PICASTLE_OPEN_PR_SCAN_LIMIT: "77",
      PICASTLE_TEST_AGENT_OUTPUT: '<plan>{"issues":[{"id":"dotfiles-aaa","title":"Ready status issue","branch":"picastle/dotfiles-aaa-ready-status"},{"id":"dotfiles-bbb","title":"Legacy label issue","branch":"picastle/dotfiles-bbb-legacy-label"}]}</plan>',
    },
  });

  assert.match(output, /Planning complete\. 2 issue\(s\) selected:/);
  assert.match(output, /dotfiles-bbb: Legacy label issue → picastle\/dotfiles-bbb-legacy-label/);
  const pebTrace = readFileSync(pebLog, "utf8");
  assert.match(pebTrace, /list --status ready_for_agent --label automation --json/);
  assert.match(pebTrace, /list --status open --label ready-for-agent --label automation --json/);
  assert.match(readFileSync(ghLog, "utf8"), /pr list --state open --limit 77 --json/);
});

test("rejects PICASTLE_TEST_AGENT_OUTPUT outside the node test context", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-test-agent-output-"));
  const repo = join(tempRoot, "repo");

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });

  const result = spawnSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "0"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_TEST_AGENT_OUTPUT: "<plan>{}</plan>",
      NODE_TEST_CONTEXT: "",
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /PICASTLE_TEST_AGENT_OUTPUT is only available to the node:test harness/);
});

test("mutable recovery declares existing PR closures and updates existing PR branches without creating duplicate PRs", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-mutable-recovery-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });
  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-bbb-update-existing"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "change.txt"), "publish me\n");
  execFileSync("git", ["add", "change.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "change\n\nCloses: dotfiles-bbb"], {
    cwd: repo,
    encoding: "utf8",
  });
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);

  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  cat <<'JSON'
[
  {"number":10,"headRefName":"picastle/dotfiles-aaa-clean","url":"https://github.com/acme/repo/pull/10","isCrossRepository":false,"headRepositoryOwner":{"login":"acme"},"headRepository":{"name":"repo"}},
  {"number":20,"headRefName":"picastle/dotfiles-bbb-update-existing","url":"https://github.com/acme/repo/pull/20","isCrossRepository":false,"headRepositoryOwner":{"login":"acme"},"headRepository":{"name":"repo"}}
]
JSON
  exit 0
fi
if [[ "$1 $2" == "pr create" ]]; then
  echo "gh pr create should not be called for existing issue/branch PRs" >&2
  exit 2
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then
  printf '%s\n' '{"data":[{"id":"dotfiles-aaa"},{"id":"dotfiles-bbb"}]}'
  exit 0
fi
if [[ "$1" == "show" ]]; then
  case "$2" in
    dotfiles-aaa) printf '%s\n' '{"data":{"title":"Already published","status":"ready_for_agent"}}'; exit 0 ;;
    dotfiles-bbb) printf '%s\n' '{"data":{"title":"Update existing PR branch","status":"ready_for_agent"}}'; exit 0 ;;
  esac
fi
if [[ "$1 $2" == "closes add" ]]; then
  printf '%s\n' 'ok'
  exit 0
fi
if [[ "$1" == "update" ]]; then
  printf '%s\n' 'ok'
  exit 0
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_PUBLISHER_AGENT: "0",
      PICASTLE_PUSH: "0",
      PICASTLE_VERIFY: "0",
    },
  });

  assert.match(output, /published: dotfiles-aaa picastle\/dotfiles-aaa-clean → https:\/\/github\.com\/acme\/repo\/pull\/10/);
  assert.match(output, /publish: dotfiles-bbb picastle\/dotfiles-bbb-update-existing/);
  assert.match(output, /updated existing PR on picastle\/dotfiles-bbb-update-existing: https:\/\/github\.com\/acme\/repo\/pull\/20/);
  assert.doesNotMatch(readFileSync(ghLog, "utf8"), /\bpr create\b/);
  const pebTrace = readFileSync(pebLog, "utf8");
  assert.match(pebTrace, /closes add dotfiles-aaa --pr https:\/\/github\.com\/acme\/repo\/pull\/10/);
  assert.match(pebTrace, /update dotfiles-aaa --status in_review/);
  assert.match(pebTrace, /closes add dotfiles-bbb --pr https:\/\/github\.com\/acme\/repo\/pull\/20/);
  assert.match(pebTrace, /update dotfiles-bbb --status in_review/);
});

test("default publisher-agent publish path reuses existing three-token issue PR without duplicate PR creation", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-agent-publish-existing-pr-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });
  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-yi5-add-tests"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "change.txt"), "publish me\n");
  execFileSync("git", ["add", "change.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "change\n\nCloses: dotfiles-yi5"], {
    cwd: repo,
    encoding: "utf8",
  });
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);

  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  count_file="$GH_LOG.pr-list-count"
  count=0
  [[ -f "$count_file" ]] && count=$(<"$count_file")
  count=$((count + 1))
  printf '%s\n' "$count" > "$count_file"
  if [[ "$count" == "1" ]]; then
    printf '%s\n' '[]'
  else
    cat <<'JSON'
[
  {"number":30,"headRefName":"picastle/dotfiles-yi5-fix-old","url":"https://github.com/acme/repo/pull/30","isCrossRepository":false,"headRepositoryOwner":{"login":"acme"},"headRepository":{"name":"repo"}}
]
JSON
  fi
  exit 0
fi
if [[ "$1 $2" == "pr create" ]]; then
  echo "gh pr create should not be called when an issue already has an open PR" >&2
  exit 2
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then
  printf '%s\n' '{"data":[{"id":"dotfiles-yi5"}]}'
  exit 0
fi
if [[ "$1 $2" == "show dotfiles-yi5" ]]; then
  printf '%s\n' '{"data":{"title":"Reuse existing PR","status":"ready_for_agent"}}'
  exit 0
fi
if [[ "$1 $2" == "closes add" ]]; then
  printf '%s\n' 'ok'
  exit 0
fi
if [[ "$1" == "update" ]]; then
  printf '%s\n' 'ok'
  exit 0
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_TEST_AGENT_OUTPUT: '<review>{"status":"approved","summary":"ready","findings":[],"checks":[]}</review>',
    },
  });

  assert.match(output, /Review\/repair loop handling 1 completed branch\(es\)/);
  assert.match(output, /issue already has open PR on picastle\/dotfiles-yi5-fix-old: https:\/\/github\.com\/acme\/repo\/pull\/30/);
  assert.doesNotMatch(readFileSync(ghLog, "utf8"), /\bpr create\b/);
  const pebTrace = readFileSync(pebLog, "utf8");
  assert.match(pebTrace, /closes add dotfiles-yi5 --pr https:\/\/github\.com\/acme\/repo\/pull\/30/);
  assert.match(pebTrace, /update dotfiles-yi5 --status in_review/);
});

test("runtime recovery and publisher prefer longest known issue id before branch slug", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-longest-issue-runtime-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });

  execFileSync("git", ["checkout", "-b", "picastle/web-api-short-work"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "web-api.txt"), "publish web-api\n");
  execFileSync("git", ["add", "web-api.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "web api\n\nCloses: web-api"], {
    cwd: repo,
    encoding: "utf8",
  });
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });

  execFileSync("git", ["checkout", "-b", "picastle/web-api-abc-new-work"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "web-api-abc.txt"), "duplicate candidate\n");
  execFileSync("git", ["add", "web-api-abc.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "web api abc\n\nCloses: web-api-abc"], {
    cwd: repo,
    encoding: "utf8",
  });
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);

  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  cat <<'JSON'
[
  {"number":50,"headRefName":"picastle/web-api-abc-fix","url":"https://github.com/acme/repo/pull/50","isCrossRepository":false,"headRepositoryOwner":{"login":"acme"},"headRepository":{"name":"repo"}}
]
JSON
  exit 0
fi
if [[ "$1 $2" == "pr create" ]]; then
  if [[ " $* " == *" --head picastle/web-api-abc-new-work "* ]]; then
    echo "duplicate PR should not be created for web-api-abc" >&2
    exit 2
  fi
  if [[ " $* " == *" --head picastle/web-api-short-work "* ]]; then
    printf '%s\n' 'https://github.com/acme/repo/pull/51'
    exit 0
  fi
  echo "unexpected gh pr create invocation: $*" >&2
  exit 2
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then
  printf '%s\n' '{"data":[{"id":"web-api"},{"id":"web-api-abc"}]}'
  exit 0
fi
if [[ "$1" == "show" ]]; then
  case "$2" in
    web-api) printf '%s\n' '{"data":{"title":"Publish web API","status":"ready_for_agent"}}'; exit 0 ;;
    web-api-abc) printf '%s\n' '{"data":{"title":"Existing web API ABC PR","status":"ready_for_agent"}}'; exit 0 ;;
  esac
fi
if [[ "$1 $2" == "closes add" ]]; then
  printf '%s\n' 'ok'
  exit 0
fi
if [[ "$1" == "update" ]]; then
  printf '%s\n' 'ok'
  exit 0
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_PUSH: "0",
      PICASTLE_TEST_AGENT_OUTPUT: '<review>{"status":"approved","summary":"ready","findings":[],"checks":[]}</review>',
    },
  });

  assert.match(output, /published: web-api-abc picastle\/web-api-abc-fix → https:\/\/github\.com\/acme\/repo\/pull\/50/);
  assert.match(output, /publish: web-api picastle\/web-api-short-work/);

  const ghTrace = readFileSync(ghLog, "utf8");
  assert.match(ghTrace, /pr create .*--head picastle\/web-api-short-work/);
  assert.doesNotMatch(ghTrace, /pr create .*--head picastle\/web-api-abc-new-work/);

  const pebTrace = readFileSync(pebLog, "utf8");
  assert.match(pebTrace, /closes add web-api-abc --pr https:\/\/github\.com\/acme\/repo\/pull\/50/);
  assert.match(pebTrace, /closes add web-api --pr https:\/\/github\.com\/acme\/repo\/pull\/51/);
  assert.doesNotMatch(pebTrace, /closes add web-api --pr https:\/\/github\.com\/acme\/repo\/pull\/50/);
});

test("stacked publisher creates PRs against previous stack heads and records comments", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-stacked-publish-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });

  const branches = [
    ["picastle/dotfiles-aaa-first", "a.txt", "dotfiles-aaa"],
    ["picastle/dotfiles-bbb-second", "b.txt", "dotfiles-bbb"],
    ["picastle/dotfiles-ccc-third", "c.txt", "dotfiles-ccc"],
  ] as const;
  for (const [branch, file, issueId] of branches) {
    execFileSync("git", ["checkout", "-b", branch], { cwd: repo, encoding: "utf8" });
    writeFileSync(join(repo, file), `${issueId}\n`);
    execFileSync("git", ["add", file], { cwd: repo, encoding: "utf8" });
    execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", `${issueId}\n\nCloses: ${issueId}`], {
      cwd: repo,
      encoding: "utf8",
    });
  }
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);

  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  printf '%s\n' '[]'
  exit 0
fi
if [[ "$1 $2" == "pr create" ]]; then
  args=" $* "
  if [[ "$args" == *" --base main "* && "$args" == *" --head picastle/dotfiles-aaa-first "* ]]; then
    printf '%s\n' 'https://github.com/acme/repo/pull/1'
    exit 0
  fi
  if [[ "$args" == *" --base picastle/dotfiles-aaa-first "* && "$args" == *" --head picastle/dotfiles-bbb-second "* ]]; then
    printf '%s\n' 'https://github.com/acme/repo/pull/2'
    exit 0
  fi
  if [[ "$args" == *" --base picastle/dotfiles-bbb-second "* && "$args" == *" --head picastle/dotfiles-ccc-third "* ]]; then
    printf '%s\n' 'https://github.com/acme/repo/pull/3'
    exit 0
  fi
  echo "unexpected stacked gh pr create invocation: $*" >&2
  exit 2
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then
  printf '%s\n' '{"data":[{"id":"dotfiles-aaa"},{"id":"dotfiles-bbb"},{"id":"dotfiles-ccc"}]}'
  exit 0
fi
if [[ "$1" == "show" ]]; then
  case "$2" in
    dotfiles-aaa) printf '%s\n' '{"data":{"title":"First","status":"ready_for_agent"}}'; exit 0 ;;
    dotfiles-bbb) printf '%s\n' '{"data":{"title":"Second","status":"ready_for_agent"}}'; exit 0 ;;
    dotfiles-ccc) printf '%s\n' '{"data":{"title":"Third","status":"ready_for_agent"}}'; exit 0 ;;
  esac
fi
if [[ "$1 $2" == "closes add" || "$1" == "update" || "$1 $2" == "comment add" ]]; then
  printf '%s\n' 'ok'
  exit 0
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_PUBLISHER_AGENT: "0",
      PICASTLE_PUSH: "0",
      PICASTLE_VERIFY: "0",
      PICASTLE_STACK_PRS: "1",
    },
  });

  assert.match(output, /Stacked PR mode: enabled/);
  assert.match(output, /verifying stacked PR mergeability for 3 branch\(es\)/);
  const ghTrace = readFileSync(ghLog, "utf8");
  assert.match(ghTrace, /pr create --base main --head picastle\/dotfiles-aaa-first/);
  assert.match(ghTrace, /pr create --base picastle\/dotfiles-aaa-first --head picastle\/dotfiles-bbb-second/);
  assert.match(ghTrace, /pr create --base picastle\/dotfiles-bbb-second --head picastle\/dotfiles-ccc-third/);
  const pebTrace = readFileSync(pebLog, "utf8");
  assert.match(pebTrace, /comment add dotfiles-aaa Picastle published stacked PR 1\/3/);
  assert.match(pebTrace, /comment add dotfiles-bbb Picastle published stacked PR 2\/3/);
  assert.match(pebTrace, /comment add dotfiles-ccc Picastle published stacked PR 3\/3/);
});

test("stack recovery relinks publishable entries when the first stack branch has no commits", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-stacked-empty-first-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });

  const branches = [
    ["picastle/dotfiles-aaa-empty", undefined, "dotfiles-aaa"],
    ["picastle/dotfiles-bbb-second", "b.txt", "dotfiles-bbb"],
    ["picastle/dotfiles-ccc-third", "c.txt", "dotfiles-ccc"],
  ] as const;
  execFileSync("git", ["checkout", "-b", branches[0]![0]], { cwd: repo, encoding: "utf8" });
  for (const [branch, file, issueId] of branches.slice(1)) {
    execFileSync("git", ["checkout", "-b", branch], { cwd: repo, encoding: "utf8" });
    writeFileSync(join(repo, file!), `${issueId}\n`);
    execFileSync("git", ["add", file!], { cwd: repo, encoding: "utf8" });
    execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", `${issueId}\n\nCloses: ${issueId}`], {
      cwd: repo,
      encoding: "utf8",
    });
  }
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });

  const xdgCache = join(tempRoot, "cache");
  const stackDir = join(xdgCache, "picastle", safeRepoIdForTest(realpathSync(repo)), "stacks");
  mkdirSync(stackDir, { recursive: true });
  const stackId = "dotfiles-aaa-dotfiles-bbb-dotfiles-ccc";
  const metadata = branches.map(([branch, , issueId], index) => ({
    stackId,
    index: index + 1,
    total: branches.length,
    issueId,
    headBranch: branch,
    baseBranch: "main",
    ...(index > 0 ? { previousBranch: branches[index - 1]![0] } : {}),
    ...(index < branches.length - 1 ? { nextBranch: branches[index + 1]![0] } : {}),
  }));
  for (const stack of metadata) {
    writeFileSync(join(stackDir, `${hashStringForTest(stack.headBranch)}.json`), JSON.stringify(stack));
  }

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);

  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  printf '%s\n' '[]'
  exit 0
fi
if [[ "$1 $2" == "pr create" ]]; then
  args=" $* "
  if [[ "$args" == *" --head picastle/dotfiles-aaa-empty "* ]]; then
    echo "empty first stack branch should not be published" >&2
    exit 2
  fi
  if [[ "$args" == *" --base main "* && "$args" == *" --head picastle/dotfiles-bbb-second "* ]]; then
    printf '%s\n' 'https://github.com/acme/repo/pull/21'
    exit 0
  fi
  if [[ "$args" == *" --base picastle/dotfiles-bbb-second "* && "$args" == *" --head picastle/dotfiles-ccc-third "* ]]; then
    printf '%s\n' 'https://github.com/acme/repo/pull/22'
    exit 0
  fi
  echo "unexpected relinked stacked gh pr create invocation: $*" >&2
  exit 2
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then
  printf '%s\n' '{"data":[{"id":"dotfiles-aaa"},{"id":"dotfiles-bbb"},{"id":"dotfiles-ccc"}]}'
  exit 0
fi
if [[ "$1" == "show" ]]; then
  case "$2" in
    dotfiles-aaa) printf '%s\n' '{"data":{"title":"Empty first","status":"ready_for_agent"}}'; exit 0 ;;
    dotfiles-bbb) printf '%s\n' '{"data":{"title":"Second","status":"ready_for_agent"}}'; exit 0 ;;
    dotfiles-ccc) printf '%s\n' '{"data":{"title":"Third","status":"ready_for_agent"}}'; exit 0 ;;
  esac
fi
if [[ "$1 $2" == "closes add" || "$1" == "update" || "$1 $2" == "comment add" ]]; then
  printf '%s\n' 'ok'
  exit 0
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: xdgCache,
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_PUBLISHER_AGENT: "0",
      PICASTLE_PUSH: "0",
      PICASTLE_VERIFY: "0",
      PICASTLE_STACK_PRS: "1",
    },
  });

  assert.match(output, /Recovery has unpublished local branches/);
  assert.match(output, /stack metadata refresh: picastle\/dotfiles-bbb-second base main/);
  const ghTrace = readFileSync(ghLog, "utf8");
  assert.doesNotMatch(ghTrace, /pr create .*--head picastle\/dotfiles-aaa-empty/);
  assert.match(ghTrace, /pr create --base main --head picastle\/dotfiles-bbb-second/);
  assert.match(ghTrace, /pr create --base picastle\/dotfiles-bbb-second --head picastle\/dotfiles-ccc-third/);
});

test("stack recovery ignores downstream branches with no commits over their stack base", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-stacked-empty-downstream-"));
  const repo = join(tempRoot, "repo");
  const origin = join(tempRoot, "origin.git");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--bare", origin], { encoding: "utf8" });
  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  execFileSync("git", ["remote", "add", "origin", origin], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["push", "-u", "origin", "main"], { cwd: repo, encoding: "utf8" });

  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-aaa-upstream"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "a.txt"), "upstream\n");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "dotfiles-aaa\n\nCloses: dotfiles-aaa"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["push", "-u", "origin", "picastle/dotfiles-aaa-upstream"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-bbb-empty"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });

  const xdgCache = join(tempRoot, "cache");
  const stackDir = join(xdgCache, "picastle", safeRepoIdForTest(realpathSync(repo)), "stacks");
  mkdirSync(stackDir, { recursive: true });
  const metadata = [
    {
      stackId: "dotfiles-aaa-dotfiles-bbb",
      index: 1,
      total: 2,
      issueId: "dotfiles-aaa",
      headBranch: "picastle/dotfiles-aaa-upstream",
      baseBranch: "main",
      nextBranch: "picastle/dotfiles-bbb-empty",
    },
    {
      stackId: "dotfiles-aaa-dotfiles-bbb",
      index: 2,
      total: 2,
      issueId: "dotfiles-bbb",
      headBranch: "picastle/dotfiles-bbb-empty",
      baseBranch: "main",
      previousBranch: "picastle/dotfiles-aaa-upstream",
    },
  ];
  for (const stack of metadata) {
    writeFileSync(join(stackDir, `${hashStringForTest(stack.headBranch)}.json`), JSON.stringify(stack));
  }

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);

  const firstPrBody = `<!-- picastle-stack\n${JSON.stringify(metadata[0])}\n-->`;
  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  printf '%s\n' '[{"number":30,"headRefName":"picastle/dotfiles-aaa-upstream","baseRefName":"main","url":"https://github.com/acme/repo/pull/30","body":${JSON.stringify(firstPrBody)},"isCrossRepository":false,"headRepository":{"name":"repo"},"headRepositoryOwner":{"login":"acme"}}]'
  exit 0
fi
if [[ "$1 $2" == "pr create" ]]; then
  echo "empty downstream branch should not be published" >&2
  exit 2
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then
  printf '%s\n' '{"data":[{"id":"dotfiles-aaa"},{"id":"dotfiles-bbb"}]}'
  exit 0
fi
if [[ "$1" == "show" ]]; then
  case "$2" in
    dotfiles-aaa) printf '%s\n' '{"data":{"title":"Upstream","status":"ready_for_agent"}}'; exit 0 ;;
    dotfiles-bbb) printf '%s\n' '{"data":{"title":"Empty downstream","status":"ready_for_agent"}}'; exit 0 ;;
  esac
fi
if [[ "$1 $2" == "closes add" || "$1" == "update" || "$1 $2" == "comment add" ]]; then
  printf '%s\n' 'ok'
  exit 0
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: xdgCache,
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_PUBLISHER_AGENT: "0",
      PICASTLE_PUSH: "0",
      PICASTLE_VERIFY: "0",
      PICASTLE_STACK_PRS: "1",
      PICASTLE_TEST_AGENT_OUTPUT: '<plan>{"issues":[]}</plan>',
    },
  });

  assert.match(output, /0 unpublished, 1 already published, 0 deferred, 1 zero-ahead ignored/);
  const ghTrace = readFileSync(ghLog, "utf8");
  assert.doesNotMatch(ghTrace, /\bpr create\b/);
  assert.doesNotMatch(output, /publish: dotfiles-bbb picastle\/dotfiles-bbb-empty/);
});

test("stack recovery republishes in persisted stack order with original bases", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-stacked-recovery-order-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });

  const branches = [
    ["picastle/dotfiles-zzz-first", "z.txt", "dotfiles-zzz"],
    ["picastle/dotfiles-aaa-second", "a.txt", "dotfiles-aaa"],
    ["picastle/dotfiles-mmm-third", "m.txt", "dotfiles-mmm"],
  ] as const;
  for (const [branch, file, issueId] of branches) {
    execFileSync("git", ["checkout", "-b", branch], { cwd: repo, encoding: "utf8" });
    writeFileSync(join(repo, file), `${issueId}\n`);
    execFileSync("git", ["add", file], { cwd: repo, encoding: "utf8" });
    execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", `${issueId}\n\nCloses: ${issueId}`], {
      cwd: repo,
      encoding: "utf8",
    });
  }
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });

  const xdgCache = join(tempRoot, "cache");
  const stackDir = join(xdgCache, "picastle", safeRepoIdForTest(realpathSync(repo)), "stacks");
  mkdirSync(stackDir, { recursive: true });
  const stackId = "dotfiles-zzz-dotfiles-aaa-dotfiles-mmm";
  const metadata = branches.map(([branch, , issueId], index) => ({
    stackId,
    index: index + 1,
    total: branches.length,
    issueId,
    headBranch: branch,
    baseBranch: "main",
    ...(index > 0 ? { previousBranch: branches[index - 1]![0] } : {}),
    ...(index < branches.length - 1 ? { nextBranch: branches[index + 1]![0] } : {}),
  }));
  for (const stack of metadata) {
    writeFileSync(join(stackDir, `${hashStringForTest(stack.headBranch)}.json`), JSON.stringify(stack));
  }

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);

  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  printf '%s\n' '[]'
  exit 0
fi
if [[ "$1 $2" == "pr create" ]]; then
  args=" $* "
  if [[ "$args" == *" --base main "* && "$args" == *" --head picastle/dotfiles-zzz-first "* ]]; then
    printf '%s\n' 'https://github.com/acme/repo/pull/10'
    exit 0
  fi
  if [[ "$args" == *" --base picastle/dotfiles-zzz-first "* && "$args" == *" --head picastle/dotfiles-aaa-second "* ]]; then
    printf '%s\n' 'https://github.com/acme/repo/pull/11'
    exit 0
  fi
  if [[ "$args" == *" --base picastle/dotfiles-aaa-second "* && "$args" == *" --head picastle/dotfiles-mmm-third "* ]]; then
    printf '%s\n' 'https://github.com/acme/repo/pull/12'
    exit 0
  fi
  echo "unexpected recovered stacked gh pr create invocation: $*" >&2
  exit 2
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then
  printf '%s\n' '{"data":[{"id":"dotfiles-aaa"},{"id":"dotfiles-mmm"},{"id":"dotfiles-zzz"}]}'
  exit 0
fi
if [[ "$1" == "show" ]]; then
  case "$2" in
    dotfiles-aaa) printf '%s\n' '{"data":{"title":"Second","status":"ready_for_agent"}}'; exit 0 ;;
    dotfiles-mmm) printf '%s\n' '{"data":{"title":"Third","status":"ready_for_agent"}}'; exit 0 ;;
    dotfiles-zzz) printf '%s\n' '{"data":{"title":"First","status":"ready_for_agent"}}'; exit 0 ;;
  esac
fi
if [[ "$1 $2" == "closes add" || "$1" == "update" || "$1 $2" == "comment add" ]]; then
  printf '%s\n' 'ok'
  exit 0
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: xdgCache,
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_PUBLISHER_AGENT: "0",
      PICASTLE_PUSH: "0",
      PICASTLE_VERIFY: "0",
      PICASTLE_STACK_PRS: "1",
    },
  });

  assert.match(output, /Recovery has unpublished local branches/);
  const ghTrace = readFileSync(ghLog, "utf8");
  assert.match(ghTrace, /pr create --base main --head picastle\/dotfiles-zzz-first/);
  assert.match(ghTrace, /pr create --base picastle\/dotfiles-zzz-first --head picastle\/dotfiles-aaa-second/);
  assert.match(ghTrace, /pr create --base picastle\/dotfiles-aaa-second --head picastle\/dotfiles-mmm-third/);
});

test("partial stack recovery preserves already-open predecessor bases", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-stacked-partial-recovery-"));
  const repo = join(tempRoot, "repo");
  const origin = join(tempRoot, "origin.git");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--bare", origin], { encoding: "utf8" });
  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  execFileSync("git", ["remote", "add", "origin", origin], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });
  execFileSync("git", ["push", "-u", "origin", "main"], { cwd: repo, encoding: "utf8" });

  const branches = [
    ["picastle/dotfiles-aaa-first", "a.txt", "dotfiles-aaa"],
    ["picastle/dotfiles-bbb-second", "b.txt", "dotfiles-bbb"],
    ["picastle/dotfiles-ccc-third", "c.txt", "dotfiles-ccc"],
  ] as const;
  for (const [index, [branch, file, issueId]] of branches.entries()) {
    execFileSync("git", ["checkout", "-b", branch], { cwd: repo, encoding: "utf8" });
    writeFileSync(join(repo, file), `${issueId}\n`);
    execFileSync("git", ["add", file], { cwd: repo, encoding: "utf8" });
    execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", `${issueId}\n\nCloses: ${issueId}`], {
      cwd: repo,
      encoding: "utf8",
    });
    if (index === 0) execFileSync("git", ["push", "-u", "origin", branch], { cwd: repo, encoding: "utf8" });
  }
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });

  const xdgCache = join(tempRoot, "cache");
  const stackDir = join(xdgCache, "picastle", safeRepoIdForTest(realpathSync(repo)), "stacks");
  mkdirSync(stackDir, { recursive: true });
  const stackId = "dotfiles-aaa-dotfiles-bbb-dotfiles-ccc";
  const metadata = branches.map(([branch, , issueId], index) => ({
    stackId,
    index: index + 1,
    total: branches.length,
    issueId,
    headBranch: branch,
    baseBranch: "main",
    ...(index > 0 ? { previousBranch: branches[index - 1]![0] } : {}),
    ...(index < branches.length - 1 ? { nextBranch: branches[index + 1]![0] } : {}),
  }));
  for (const stack of metadata) {
    writeFileSync(join(stackDir, `${hashStringForTest(stack.headBranch)}.json`), JSON.stringify(stack));
  }

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);

  const firstPrBody = `<!-- picastle-stack\n${JSON.stringify(metadata[0])}\n-->`;
  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  printf '%s\n' '[{"number":10,"headRefName":"picastle/dotfiles-aaa-first","baseRefName":"main","url":"https://github.com/acme/repo/pull/10","body":${JSON.stringify(firstPrBody)},"isCrossRepository":false,"headRepository":{"name":"repo"},"headRepositoryOwner":{"login":"acme"}}]'
  exit 0
fi
if [[ "$1 $2" == "pr create" ]]; then
  args=" $* "
  if [[ "$args" == *" --base picastle/dotfiles-aaa-first "* && "$args" == *" --head picastle/dotfiles-bbb-second "* ]]; then
    printf '%s\n' 'https://github.com/acme/repo/pull/11'
    exit 0
  fi
  if [[ "$args" == *" --base picastle/dotfiles-bbb-second "* && "$args" == *" --head picastle/dotfiles-ccc-third "* ]]; then
    printf '%s\n' 'https://github.com/acme/repo/pull/12'
    exit 0
  fi
  echo "unexpected partial stacked gh pr create invocation: $*" >&2
  exit 2
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then
  printf '%s\n' '{"data":[{"id":"dotfiles-aaa"},{"id":"dotfiles-bbb"},{"id":"dotfiles-ccc"}]}'
  exit 0
fi
if [[ "$1" == "show" ]]; then
  case "$2" in
    dotfiles-aaa) printf '%s\n' '{"data":{"title":"First","status":"ready_for_agent"}}'; exit 0 ;;
    dotfiles-bbb) printf '%s\n' '{"data":{"title":"Second","status":"ready_for_agent"}}'; exit 0 ;;
    dotfiles-ccc) printf '%s\n' '{"data":{"title":"Third","status":"ready_for_agent"}}'; exit 0 ;;
  esac
fi
if [[ "$1 $2" == "closes add" || "$1" == "update" || "$1 $2" == "comment add" ]]; then
  printf '%s\n' 'ok'
  exit 0
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: xdgCache,
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_PUBLISHER_AGENT: "0",
      PICASTLE_PUSH: "0",
      PICASTLE_VERIFY: "0",
      PICASTLE_STACK_PRS: "1",
    },
  });

  assert.match(output, /Recovery has unpublished local branches/);
  const ghTrace = readFileSync(ghLog, "utf8");
  assert.doesNotMatch(ghTrace, /pr create --base main --head picastle\/dotfiles-bbb-second/);
  assert.match(ghTrace, /pr create --base picastle\/dotfiles-aaa-first --head picastle\/dotfiles-bbb-second/);
  assert.match(ghTrace, /pr create --base picastle\/dotfiles-bbb-second --head picastle\/dotfiles-ccc-third/);
});

test("unpublished stack recovery clears merged upstream predecessors before creating PR", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-stacked-merged-upstream-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], { cwd: repo, encoding: "utf8" });

  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-aaa-upstream"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "a.txt"), "upstream\n");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "dotfiles-aaa\n\nCloses: dotfiles-aaa"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-bbb-downstream"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "b.txt"), "downstream\n");
  execFileSync("git", ["add", "b.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "dotfiles-bbb\n\nCloses: dotfiles-bbb"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "a.txt"), "upstream\n");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "squash upstream"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["branch", "-D", "picastle/dotfiles-aaa-upstream"], { cwd: repo, encoding: "utf8" });

  const xdgCache = join(tempRoot, "cache");
  const stackDir = join(xdgCache, "picastle", safeRepoIdForTest(realpathSync(repo)), "stacks");
  mkdirSync(stackDir, { recursive: true });
  const staleStack = {
    stackId: "dotfiles-aaa-dotfiles-bbb",
    index: 2,
    total: 2,
    issueId: "dotfiles-bbb",
    headBranch: "picastle/dotfiles-bbb-downstream",
    baseBranch: "main",
    previousBranch: "picastle/dotfiles-aaa-upstream",
  };
  writeFileSync(join(stackDir, `${hashStringForTest(staleStack.headBranch)}.json`), JSON.stringify(staleStack));

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);
  const gh = join(fakeBin, "gh");
  writeFileSync(gh, `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'; exit 0; fi
if [[ "$1 $2" == "pr list" ]]; then printf '%s\n' '[]'; exit 0; fi
if [[ "$1 $2" == "pr create" ]]; then
  args=" $* "
  body_file=""
  while [[ $# -gt 0 ]]; do
    case "$1" in --body-file) body_file="$2"; shift 2 ;; *) shift ;; esac
  done
  if [[ "$args" == *" --base main "* && "$args" == *" --head picastle/dotfiles-bbb-downstream "* ]]; then
    if grep -q 'Previous:' "$body_file"; then echo "stale stack previous branch in PR body" >&2; exit 3; fi
    printf '%s\n' 'https://github.com/acme/repo/pull/20'
    exit 0
  fi
  echo "unexpected recovered downstream gh pr create invocation: $args" >&2
  exit 2
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`);
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(peb, `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then printf '%s\n' '{"data":[{"id":"dotfiles-bbb"}]}'; exit 0; fi
if [[ "$1" == "show" ]]; then printf '%s\n' '{"data":{"title":"Downstream","status":"ready_for_agent"}}'; exit 0; fi
if [[ "$1 $2" == "closes add" || "$1" == "update" || "$1 $2" == "comment add" ]]; then printf '%s\n' 'ok'; exit 0; fi
echo "unexpected peb invocation: $*" >&2
exit 1
`);
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: xdgCache,
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_PUBLISHER_AGENT: "0",
      PICASTLE_PUSH: "0",
      PICASTLE_VERIFY: "0",
      PICASTLE_STACK_PRS: "1",
    },
  });

  assert.match(output, /stack metadata refresh: picastle\/dotfiles-bbb-downstream base main/);
  assert.match(output, /rebasing stack branch picastle\/dotfiles-bbb-downstream onto main/);
  assert.match(readFileSync(ghLog, "utf8"), /pr create --base main --head picastle\/dotfiles-bbb-downstream/);
  assert.doesNotThrow(() => execFileSync("git", ["merge-base", "--is-ancestor", "main", "picastle/dotfiles-bbb-downstream"], { cwd: repo }));
});

test("plan-only recovery spots dirty open downstream stack PRs after merged upstream", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-dirty-open-stack-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-aaa-upstream"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "a.txt"), "upstream\n");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "dotfiles-aaa"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-bbb-downstream"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "b.txt"), "downstream\n");
  execFileSync("git", ["add", "b.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "dotfiles-bbb"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "a.txt"), "upstream\n");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "squash upstream"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["branch", "-D", "picastle/dotfiles-aaa-upstream"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "picastle/dotfiles-bbb-downstream"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "dirty.txt"), "uncommitted downstream repair\n");

  const stackBody = `<!-- picastle-stack\n${JSON.stringify({
    stackId: "dotfiles-aaa-dotfiles-bbb",
    index: 2,
    total: 2,
    issueId: "dotfiles-bbb",
    headBranch: "picastle/dotfiles-bbb-downstream",
    baseBranch: "main",
    previousBranch: "picastle/dotfiles-aaa-upstream",
  })}\n-->`;
  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);
  const gh = join(fakeBin, "gh");
  writeFileSync(gh, `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'; exit 0; fi
if [[ "$1 $2" == "pr list" ]]; then cat <<'JSON'
[{"number":22,"headRefName":"picastle/dotfiles-bbb-downstream","baseRefName":"picastle/dotfiles-aaa-upstream","url":"https://github.com/acme/repo/pull/22","body":${JSON.stringify(stackBody)},"isCrossRepository":false,"headRepository":{"name":"repo"},"headRepositoryOwner":{"login":"acme"}}]
JSON
exit 0; fi
echo "unexpected gh invocation: $*" >&2
exit 1
`);
  chmodSync(gh, 0o755);
  const peb = join(fakeBin, "peb");
  writeFileSync(peb, `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then printf '%s\n' '{"data":[{"id":"dotfiles-bbb","title":"Downstream","status":"ready_for_agent"}]}'; exit 0; fi
if [[ "$1" == "show" ]]; then printf '%s\n' '{"data":{"title":"Downstream","status":"ready_for_agent"}}'; exit 0; fi
echo "unexpected peb invocation: $*" >&2
exit 1
`);
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1", "--plan-only"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_STACK_PRS: "1",
    },
  });

  assert.match(output, /Recovery scan: 1 interrupted/);
  assert.match(output, /stack retarget: picastle\/dotfiles-bbb-downstream base picastle\/dotfiles-aaa-upstream → main \(plan-only\)/);
  assert.doesNotMatch(readFileSync(ghLog, "utf8"), /pr edit/);
});

test("mutable recovery defers dirty open downstream stack PR retargets", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-dirty-open-stack-mutable-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  execFileSync("git", ["config", "user.name", "Picastle Test"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-aaa-upstream"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "a.txt"), "upstream\n");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "dotfiles-aaa"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-bbb-downstream"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "b.txt"), "downstream\n");
  execFileSync("git", ["add", "b.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "dotfiles-bbb"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "a.txt"), "upstream\n");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "squash upstream"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["branch", "-D", "picastle/dotfiles-aaa-upstream"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "picastle/dotfiles-bbb-downstream"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "dirty.txt"), "uncommitted downstream repair\n");

  const stackBody = `<!-- picastle-stack\n${JSON.stringify({
    stackId: "dotfiles-aaa-dotfiles-bbb",
    index: 2,
    total: 2,
    issueId: "dotfiles-bbb",
    headBranch: "picastle/dotfiles-bbb-downstream",
    baseBranch: "main",
    previousBranch: "picastle/dotfiles-aaa-upstream",
  })}\n-->`;
  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);
  const gh = join(fakeBin, "gh");
  writeFileSync(gh, `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'; exit 0; fi
if [[ "$1 $2" == "pr list" ]]; then cat <<'JSON'
[{"number":22,"headRefName":"picastle/dotfiles-bbb-downstream","baseRefName":"picastle/dotfiles-aaa-upstream","url":"https://github.com/acme/repo/pull/22","body":${JSON.stringify(stackBody)},"isCrossRepository":false,"headRepository":{"name":"repo"},"headRepositoryOwner":{"login":"acme"}}]
JSON
exit 0; fi
if [[ "$1 $2" == "pr edit" ]]; then echo "dirty stack PR should not be edited during recovery reconcile" >&2; exit 7; fi
echo "unexpected gh invocation: $*" >&2
exit 1
`);
  chmodSync(gh, 0o755);
  const peb = join(fakeBin, "peb");
  writeFileSync(peb, `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then printf '%s\n' '{"data":[]}'; exit 0; fi
if [[ "$1" == "show" ]]; then printf '%s\n' '{"data":{"title":"Downstream","status":"in_review"}}'; exit 0; fi
echo "unexpected peb invocation: $*" >&2
exit 1
`);
  chmodSync(peb, 0o755);

  const result = spawnSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_STACK_PRS: "1",
      PICASTLE_TEST_AGENT_OUTPUT: '<plan>{"issues":[]}</plan>',
    },
  });

  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, output);
  assert.match(output, /defer: dotfiles-bbb picastle\/dotfiles-bbb-downstream: pebble status is in_review, not ready_for_agent/);
  assert.match(output, /stack reconcile deferred: picastle\/dotfiles-bbb-downstream base main \(dirty worktree; recovery will resume it first\)/);
  assert.doesNotMatch(output, /refusing to rebase dirty stack worktree/);
  assert.doesNotMatch(readFileSync(ghLog, "utf8"), /pr edit/);
});

test("stack reconciliation rebases later downstream PRs after predecessor is rewritten", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-stack-cascade-rebase-"));
  const repo = join(tempRoot, "repo");
  const origin = join(tempRoot, "origin.git");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--bare", origin], { encoding: "utf8" });
  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  execFileSync("git", ["config", "user.name", "Picastle Test"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["remote", "add", "origin", origin], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "initial"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["push", "-u", "origin", "main"], { cwd: repo, encoding: "utf8" });

  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-aaa-upstream"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "a.txt"), "upstream\n");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "dotfiles-aaa"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-bbb-middle"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "b.txt"), "middle\n");
  execFileSync("git", ["add", "b.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "dotfiles-bbb"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["push", "-u", "origin", "picastle/dotfiles-bbb-middle"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-ccc-tail"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "c.txt"), "tail\n");
  execFileSync("git", ["add", "c.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "dotfiles-ccc"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["push", "-u", "origin", "picastle/dotfiles-ccc-tail"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "a.txt"), "upstream\n");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["commit", "-m", "squash upstream"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["branch", "-D", "picastle/dotfiles-aaa-upstream"], { cwd: repo, encoding: "utf8" });

  const stackId = "dotfiles-aaa-dotfiles-bbb-dotfiles-ccc";
  const middleBody = `<!-- picastle-stack\n${JSON.stringify({
    stackId,
    index: 2,
    total: 3,
    issueId: "dotfiles-bbb",
    headBranch: "picastle/dotfiles-bbb-middle",
    baseBranch: "main",
    previousBranch: "picastle/dotfiles-aaa-upstream",
    nextBranch: "picastle/dotfiles-ccc-tail",
  })}\n-->`;
  const tailBody = `<!-- picastle-stack\n${JSON.stringify({
    stackId,
    index: 3,
    total: 3,
    issueId: "dotfiles-ccc",
    headBranch: "picastle/dotfiles-ccc-tail",
    baseBranch: "main",
    previousBranch: "picastle/dotfiles-bbb-middle",
  })}\n-->`;
  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);
  const gh = join(fakeBin, "gh");
  writeFileSync(gh, `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'; exit 0; fi
if [[ "$1 $2" == "pr list" ]]; then cat <<'JSON'
[{"number":22,"headRefName":"picastle/dotfiles-bbb-middle","baseRefName":"picastle/dotfiles-aaa-upstream","url":"https://github.com/acme/repo/pull/22","body":${JSON.stringify(middleBody)},"isCrossRepository":false,"headRepository":{"name":"repo"},"headRepositoryOwner":{"login":"acme"}},{"number":33,"headRefName":"picastle/dotfiles-ccc-tail","baseRefName":"picastle/dotfiles-bbb-middle","url":"https://github.com/acme/repo/pull/33","body":${JSON.stringify(tailBody)},"isCrossRepository":false,"headRepository":{"name":"repo"},"headRepositoryOwner":{"login":"acme"}}]
JSON
exit 0; fi
if [[ "$1 $2" == "pr edit" ]]; then exit 0; fi
echo "unexpected gh invocation: $*" >&2
exit 1
`);
  chmodSync(gh, 0o755);
  const peb = join(fakeBin, "peb");
  writeFileSync(peb, `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then printf '%s\n' '{"data":[{"id":"dotfiles-bbb"},{"id":"dotfiles-ccc"}]}'; exit 0; fi
if [[ "$1" == "show" ]]; then printf '%s\n' '{"data":{"title":"Stack entry","status":"ready_for_agent"}}'; exit 0; fi
if [[ "$1 $2" == "closes add" || "$1" == "update" ]]; then printf '%s\n' 'ok'; exit 0; fi
echo "unexpected peb invocation: $*" >&2
exit 1
`);
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_MAX_ISSUES: "0",
      PICASTLE_STACK_PRS: "1",
    },
  });

  assert.match(output, /stack retarget: picastle\/dotfiles-bbb-middle base picastle\/dotfiles-aaa-upstream → main/);
  assert.match(output, /rebasing stack branch picastle\/dotfiles-bbb-middle onto main/);
  assert.match(output, /rebasing stack branch picastle\/dotfiles-ccc-tail onto picastle\/dotfiles-bbb-middle/);
  assert.doesNotThrow(() => execFileSync("git", ["merge-base", "--is-ancestor", "picastle/dotfiles-bbb-middle", "picastle/dotfiles-ccc-tail"], { cwd: repo }));
  assert.equal(execFileSync("git", ["rev-parse", "picastle/dotfiles-bbb-middle"], { cwd: repo, encoding: "utf8" }), execFileSync("git", ["rev-parse", "origin/picastle/dotfiles-bbb-middle"], { cwd: repo, encoding: "utf8" }));
  assert.equal(execFileSync("git", ["rev-parse", "picastle/dotfiles-ccc-tail"], { cwd: repo, encoding: "utf8" }), execFileSync("git", ["rev-parse", "origin/picastle/dotfiles-ccc-tail"], { cwd: repo, encoding: "utf8" }));
  const ghTrace = readFileSync(ghLog, "utf8");
  assert.match(ghTrace, /pr edit https:\/\/github\.com\/acme\/repo\/pull\/22 --base main/);
  assert.doesNotMatch(ghTrace, /pull\/33/);
});

test("stack reconciliation rebases downstream branches before retargeting merged upstream PRs", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-stack-rebase-"));
  const repo = join(tempRoot, "repo");
  const origin = join(tempRoot, "origin.git");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--bare", origin], { encoding: "utf8" });
  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  execFileSync("git", ["remote", "add", "origin", origin], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["push", "-u", "origin", "main"], { cwd: repo, encoding: "utf8" });

  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-aaa-upstream"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "a.txt"), "upstream\n");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "dotfiles-aaa"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-bbb-downstream"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "b.txt"), "downstream\n");
  execFileSync("git", ["add", "b.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "dotfiles-bbb"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["push", "-u", "origin", "picastle/dotfiles-bbb-downstream"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["checkout", "main"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "a.txt"), "upstream\n");
  execFileSync("git", ["add", "a.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "squash upstream"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["branch", "-D", "picastle/dotfiles-aaa-upstream"], { cwd: repo, encoding: "utf8" });

  const stackBody = `<!-- picastle-stack\n${JSON.stringify({
    stackId: "dotfiles-aaa-dotfiles-bbb",
    index: 2,
    total: 2,
    issueId: "dotfiles-bbb",
    headBranch: "picastle/dotfiles-bbb-downstream",
    baseBranch: "main",
    previousBranch: "picastle/dotfiles-aaa-upstream",
  })}\n-->`;
  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);
  const gh = join(fakeBin, "gh");
  writeFileSync(gh, `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'; exit 0; fi
if [[ "$1 $2" == "pr list" ]]; then cat <<'JSON'
[{"number":22,"headRefName":"picastle/dotfiles-bbb-downstream","baseRefName":"picastle/dotfiles-aaa-upstream","url":"https://github.com/acme/repo/pull/22","body":${JSON.stringify(stackBody)},"isCrossRepository":false,"headRepository":{"name":"repo"},"headRepositoryOwner":{"login":"acme"}}]
JSON
exit 0; fi
if [[ "$1 $2" == "pr edit" ]]; then exit 0; fi
echo "unexpected gh invocation: $*" >&2
exit 1
`);
  chmodSync(gh, 0o755);
  const peb = join(fakeBin, "peb");
  writeFileSync(peb, `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then printf '%s\n' '{"data":[{"id":"dotfiles-bbb"}]}'; exit 0; fi
if [[ "$1" == "show" ]]; then printf '%s\n' '{"data":{"title":"Downstream","status":"ready_for_agent"}}'; exit 0; fi
if [[ "$1 $2" == "closes add" || "$1" == "update" ]]; then printf '%s\n' 'ok'; exit 0; fi
echo "unexpected peb invocation: $*" >&2
exit 1
`);
  chmodSync(peb, 0o755);

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_MAX_ISSUES: "0",
      PICASTLE_STACK_PRS: "1",
    },
  });

  assert.match(output, /rebasing stack branch picastle\/dotfiles-bbb-downstream onto main/);
  assert.doesNotThrow(() => execFileSync("git", ["merge-base", "--is-ancestor", "main", "picastle/dotfiles-bbb-downstream"], { cwd: repo }));
  assert.equal(execFileSync("git", ["rev-parse", "picastle/dotfiles-bbb-downstream"], { cwd: repo, encoding: "utf8" }), execFileSync("git", ["rev-parse", "origin/picastle/dotfiles-bbb-downstream"], { cwd: repo, encoding: "utf8" }));
  assert.match(readFileSync(ghLog, "utf8"), /pr edit https:\/\/github\.com\/acme\/repo\/pull\/22 --base main/);
});

test("interrupted dirty stack recovery resumes sequentially before downstream rebase", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-stacked-interrupted-sequential-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  const worktrees = join(tempRoot, "worktrees");
  mkdirSync(fakeBin, { recursive: true });
  mkdirSync(worktrees, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });

  const firstBranch = "picastle/dotfiles-aaa-first";
  const secondBranch = "picastle/dotfiles-bbb-second";
  const firstWorktree = join(worktrees, "dotfiles-aaa-first");
  const secondWorktree = join(worktrees, "dotfiles-bbb-second");
  execFileSync("git", ["worktree", "add", "-b", firstBranch, firstWorktree, "main"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["worktree", "add", "-b", secondBranch, secondWorktree, firstBranch], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(firstWorktree, "a.txt"), "interrupted first\n");
  writeFileSync(join(secondWorktree, "b.txt"), "interrupted second\n");

  const xdgCache = join(tempRoot, "cache");
  const stackDir = join(xdgCache, "picastle", safeRepoIdForTest(realpathSync(repo)), "stacks");
  mkdirSync(stackDir, { recursive: true });
  const metadata: StackMetadata[] = [
    {
      stackId: "dotfiles-aaa-dotfiles-bbb",
      index: 1,
      total: 2,
      issueId: "dotfiles-aaa",
      headBranch: firstBranch,
      baseBranch: "main",
      nextBranch: secondBranch,
    },
    {
      stackId: "dotfiles-aaa-dotfiles-bbb",
      index: 2,
      total: 2,
      issueId: "dotfiles-bbb",
      headBranch: secondBranch,
      baseBranch: "main",
      previousBranch: firstBranch,
    },
  ];
  for (const stack of metadata) {
    writeFileSync(join(stackDir, `${hashStringForTest(stack.headBranch)}.json`), JSON.stringify(stack));
  }

  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);

  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  printf '%s\n' '[]'
  exit 0
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
if [[ "$1" == "list" ]]; then
  printf '%s\n' '{"data":[{"id":"dotfiles-aaa"},{"id":"dotfiles-bbb"}]}'
  exit 0
fi
if [[ "$1" == "show" ]]; then
  case "$2" in
    dotfiles-aaa) printf '%s\n' '{"data":{"title":"First","status":"ready_for_agent"}}'; exit 0 ;;
    dotfiles-bbb) printf '%s\n' '{"data":{"title":"Second","status":"ready_for_agent"}}'; exit 0 ;;
  esac
fi
if [[ "$1" == "update" ]]; then
  printf '%s\n' 'ok'
  exit 0
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const agentLog = join(tempRoot, "agent.log");
  const agentLock = join(tempRoot, "agent.lock");
  const agentCommand = `
issue="\${PICASTLE_AGENT_NAME#implementer-}"
printf 'start %s\n' "$issue" >> ${JSON.stringify(agentLog)}
if [[ -e ${JSON.stringify(agentLock)} ]]; then
  printf 'concurrent %s\n' "$issue" >> ${JSON.stringify(agentLog)}
  exit 9
fi
touch ${JSON.stringify(agentLock)}
sleep 0.2
git add .
git -c user.name='Picastle Test' -c user.email=test@example.com commit -m "$issue recovery\n\nCloses: $issue"
rm -f ${JSON.stringify(agentLock)}
printf 'end %s\n' "$issue" >> ${JSON.stringify(agentLog)}
`;

  const output = execFileSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1", "--concurrency", "2", "--no-pr", "--no-push", "--no-verify"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      XDG_CACHE_HOME: xdgCache,
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_PUBLISHER_AGENT: "0",
      PICASTLE_STACK_PRS: "1",
      PICASTLE_TEST_AGENT_COMMAND: agentCommand,
    },
  });

  assert.match(output, /Recovery contains stacked implementation work; resuming sequentially in stack order\./);
  assert.match(output, /rebasing stack branch picastle\/dotfiles-bbb-second onto picastle\/dotfiles-aaa-first/);
  assert.equal(readFileSync(agentLog, "utf8"), "start dotfiles-aaa\nend dotfiles-aaa\nstart dotfiles-bbb\nend dotfiles-bbb\n");
  assert.doesNotThrow(() => execFileSync("git", ["merge-base", "--is-ancestor", firstBranch, secondBranch], { cwd: repo }));
});

function hashStringForTest(input: string): string {
  let hash = 5381;
  for (const char of input) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

function safeRepoIdForTest(root: string): string {
  return root.replace(/^\//, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

test("runtime recovery fails closed on malformed open PR discovery without mutating pebbles", () => {
  const packageDir = dirname(fileURLToPath(import.meta.url));
  const tempRoot = mkdtempSync(join(tmpdir(), "picastle-broken-pr-discovery-"));
  const repo = join(tempRoot, "repo");
  const fakeBin = join(tempRoot, "bin");
  mkdirSync(fakeBin, { recursive: true });

  execFileSync("git", ["init", "--initial-branch=main", repo], { encoding: "utf8" });
  writeFileSync(join(repo, "README.md"), "# test repo\n");
  execFileSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "initial"], {
    cwd: repo,
    encoding: "utf8",
  });

  const ghLog = join(tempRoot, "gh.log");
  const pebLog = join(tempRoot, "peb.log");
  writeFileSync(pebLog, "");
  const bash = join(fakeBin, "bash");
  writeFileSync(bash, "#!/bin/sh\nexec /bin/bash --noprofile --norc \"$@\"\n");
  chmodSync(bash, 0o755);

  const gh = join(fakeBin, "gh");
  writeFileSync(
    gh,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GH_LOG"
if [[ "$1 $2" == "repo view" ]]; then
  printf '%s\n' '{"name":"repo","owner":{"login":"acme"}}'
  exit 0
fi
if [[ "$1 $2" == "pr list" ]]; then
  printf '%s\n' 'not json'
  exit 0
fi
if [[ "$1 $2" == "pr create" ]]; then
  echo "gh pr create should not be called after broken PR discovery" >&2
  exit 2
fi
echo "unexpected gh invocation: $*" >&2
exit 1
`,
  );
  chmodSync(gh, 0o755);

  const peb = join(fakeBin, "peb");
  writeFileSync(
    peb,
    `#!/usr/bin/env bash
printf '%s\n' "$*" >> "$PEB_LOG"
if [[ "$1" == "list" ]]; then
  printf '%s\n' '{"data":[{"id":"dotfiles-aaa"}]}'
  exit 0
fi
if [[ "$1" == "show" ]]; then
  printf '%s\n' '{"data":{"title":"Issue","status":"ready_for_agent"}}'
  exit 0
fi
if [[ "$1 $2" == "closes add" || "$1" == "update" ]]; then
  echo "peb mutation should not be called after broken PR discovery" >&2
  exit 2
fi
echo "unexpected peb invocation: $*" >&2
exit 1
`,
  );
  chmodSync(peb, 0o755);

  const result = spawnSync(join(packageDir, "node_modules", ".bin", "tsx"), ["main.mts", "--repo", repo, "--max-iterations", "1"], {
    cwd: packageDir,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      GH_LOG: ghLog,
      PEB_LOG: pebLog,
      XDG_CACHE_HOME: join(tempRoot, "cache"),
      PICASTLE_PEB_REMOTE: "",
      PICASTLE_PEB_REPO: "",
      PICASTLE_TEST_AGENT_OUTPUT: '<review>{"status":"approved","summary":"ready","findings":[],"checks":[]}</review>',
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /failed to parse gh pr list JSON/);
  assert.doesNotMatch(readFileSync(ghLog, "utf8"), /\bpr create\b/);
  assert.doesNotMatch(readFileSync(pebLog, "utf8"), /\b(?:closes add|update)\b/);
});

test("plan-only recovery produces no mutating recovery actions", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/dotfiles-aaa-ready-with-pr",
        issueId: "dotfiles-aaa",
        title: "Already published",
        issueStatus: "ready_for_agent",
        issueLookup: { state: "found" },
        ahead: 0,
        dirty: false,
        openPrUrl: "https://github.com/example/repo/pull/1",
      },
      {
        branch: "picastle/dotfiles-bbb-needs-worktree",
        issueId: "dotfiles-bbb",
        title: "Needs publish",
        issueStatus: "ready_for_agent",
        issueLookup: { state: "found" },
        ahead: 1,
        dirty: false,
      },
    ],
    "ready_for_agent",
  );

  assert.deepEqual(selectRecoveryActions(plan, { readOnly: true }), []);
  assert.deepEqual(selectRecoveredUnpublishedBranches(plan, { readOnly: true }), []);
  assert.deepEqual(selectRecoveryActions(plan, { readOnly: false }), [
    { kind: "declare-pending-closure", issueId: "dotfiles-aaa", prUrl: "https://github.com/example/repo/pull/1" },
    { kind: "ensure-unpublished-worktree", issue: plan.unpublishedBranches[0] },
  ]);
  assert.deepEqual(selectRecoveredUnpublishedBranches(plan, { readOnly: false }), plan.unpublishedBranches);
});

// Keep the pure publish-flow boundary locked down alongside the runtime
// publisher coverage above so both publish paths agree on duplicate-PR avoidance.
test("publish flow reuses existing issue PRs and only creates PRs when needed", () => {
  const defaultPublisherAgentExistingIssuePrFlow = decidePublishFlow(
    "picastle/dotfiles-aaa-new-branch",
    { headRefName: "sandcastle/dotfiles-aaa-existing-pr", url: "https://github.com/example/repo/pull/1" },
    { openPrs: true },
  );
  assert.deepEqual(
    defaultPublisherAgentExistingIssuePrFlow,
    {
      kind: "use-existing-issue-pr",
      existingPr: { headRefName: "sandcastle/dotfiles-aaa-existing-pr", url: "https://github.com/example/repo/pull/1" },
      shouldPush: false,
      shouldCreatePr: false,
    },
  );
  assert.deepEqual(decidePublishCommandBoundary(defaultPublisherAgentExistingIssuePrFlow, { push: true }), {
    kind: "use-existing-issue-pr",
    shouldRunPushBoundary: false,
    shouldPush: false,
    shouldCreatePr: false,
    existingPrUrl: "https://github.com/example/repo/pull/1",
  });
  assert.deepEqual(
    decidePublishFlow(
      "picastle/dotfiles-aaa-existing-pr",
      { headRefName: "picastle/dotfiles-aaa-existing-pr", url: "https://github.com/example/repo/pull/2" },
      { openPrs: true },
    ),
    {
      kind: "update-existing-branch-pr",
      existingPr: { headRefName: "picastle/dotfiles-aaa-existing-pr", url: "https://github.com/example/repo/pull/2" },
      shouldPush: true,
      shouldCreatePr: false,
    },
  );
  assert.deepEqual(decidePublishFlow("picastle/dotfiles-aaa-new", undefined, { openPrs: true }), {
    kind: "create-new-pr",
    shouldPush: true,
    shouldCreatePr: true,
  });
  assert.deepEqual(decidePublishFlow("picastle/dotfiles-aaa-new", undefined, { openPrs: false }), {
    kind: "skip-pr-creation",
    shouldPush: true,
    shouldCreatePr: false,
  });
});

test("recognizes only zero-exit peb closure registration as success", () => {
  assert.equal(pebClosureRegistrationSucceeded({ status: 0, stdout: "", stderr: "" }), true);
  assert.equal(pebClosureRegistrationSucceeded({ status: 0, stdout: "already registered", stderr: "" }), true);
  assert.equal(pebClosureRegistrationSucceeded({ status: 1, stdout: "closure already exists", stderr: "" }), false);
  assert.equal(pebClosureRegistrationSucceeded({ status: 1, stdout: "", stderr: "already-existing closure" }), false);
  assert.equal(pebClosureRegistrationSucceeded({ status: 1, stdout: "", stderr: "PR does not exist" }), false);
});

test("validates planner selections against filtered candidates", () => {
  const candidates = [
    { id: "dotfiles-aaa", title: "Allowed" },
    { id: "dotfiles-bbb", title: "Also allowed" },
  ];

  assert.deepEqual(
    validatePlannedIssueSelections(
      [{ id: "dotfiles-aaa", title: "Allowed", branch: "sandcastle/dotfiles-aaa-old-prefix" }],
      candidates,
      { normalizeBranch: (branch) => branch.replace(/^sandcastle\//, "picastle/") },
    ),
    [{ id: "dotfiles-aaa", title: "Allowed", branch: "picastle/dotfiles-aaa-old-prefix" }],
  );

  assert.throws(
    () => validatePlannedIssueSelections([
      { id: "dotfiles-aaa", title: "Allowed", branch: "picastle/dotfiles-aaa-a" },
      { id: "dotfiles-aaa", title: "Allowed", branch: "picastle/dotfiles-aaa-b" },
    ], candidates),
    /duplicate issue id dotfiles-aaa/,
  );
  assert.throws(
    () => validatePlannedIssueSelections([
      { id: "dotfiles-ccc", title: "Suppressed", branch: "picastle/dotfiles-ccc-suppressed" },
    ], candidates, { suppressedIssueIds: ["dotfiles-ccc"] }),
    /suppressed issue id dotfiles-ccc/,
  );
  assert.throws(
    () => validatePlannedIssueSelections([
      { id: "dotfiles-ccc", title: "Not a candidate", branch: "picastle/dotfiles-ccc-missing" },
    ], candidates),
    /non-candidate issue id dotfiles-ccc/,
  );
  assert.throws(
    () => validatePlannedIssueSelections(
      [{ id: "dotfiles-aaa", title: "Allowed", branch: "picastle/dotfiles-ccc-suppressed" }],
      candidates,
      { suppressedIssueIds: ["dotfiles-ccc"] },
    ),
    /branch targets suppressed issue id dotfiles-ccc/,
  );
  assert.throws(
    () => validatePlannedIssueSelections(
      [{ id: "dotfiles-aaa", title: "Allowed", branch: "sandcastle/dotfiles-bbb-other-work" }],
      candidates,
      { normalizeBranch: (branch) => branch.replace(/^sandcastle\//, "picastle/") },
    ),
    /branch targets issue id dotfiles-bbb, not selected issue id dotfiles-aaa/,
  );
});

test("recovery blocked issues wire into planner validation to avoid duplicate PR work", () => {
  const plan = buildRecoveryPlan(
    [
      {
        branch: "picastle/web-api-abc-fix",
        issueId: "web-api-abc",
        title: "Fix web API",
        issueStatus: "ready_for_agent",
        issueLookup: { state: "found" },
        ahead: 1,
        dirty: false,
        openPrUrl: "https://github.com/acme/repo/pull/20",
      },
    ],
    "ready_for_agent",
  );

  assert.equal(plan.blockedIssueIds.has("web-api-abc"), true);
  assert.throws(
    () => validatePlannedIssueSelections(
      [{ id: "web-api-abc", title: "Fix web API", branch: "picastle/web-api-abc-new" }],
      [],
      { suppressedIssueIds: plan.blockedIssueIds },
    ),
    /suppressed issue id web-api-abc/,
  );
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
