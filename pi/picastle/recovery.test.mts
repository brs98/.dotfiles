import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecoveryPlan,
  classifyPebShowFailure,
  extractIssueIdFromBranch,
  findOpenPrForIssue,
  normalizeOpenPrsJson,
  parseFirstOpenPrUrl,
  parseKnownIssueIdsJson,
  parseOpenPrsByHead,
  validatePlannedIssueSelections,
  type RecoveryBranchInput,
} from "./recovery.mjs";

test("extracts pebble ids before realistic branch slugs during recovery", () => {
  assert.equal(extractIssueIdFromBranch("picastle/ricekit-394-fix-old"), "ricekit-394");
  assert.equal(extractIssueIdFromBranch("picastle/dotfiles-yi5-resumable-idempotent-runs"), "dotfiles-yi5");
  assert.equal(extractIssueIdFromBranch("picastle/my-repo-abc-fix"), "my-repo-abc");
  assert.equal(extractIssueIdFromBranch("picastle/my-repo-abc-fix", ["my-repo", "my-repo-abc"]), "my-repo-abc");
  assert.equal(extractIssueIdFromBranch("picastle/web-api-abc-fix", ["web-api", "web-api-abc"]), "web-api-abc");

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
  assert.deepEqual(plan.ignoredBranches.map((branch) => [branch.issueId, branch.reason]), [
    ["dotfiles-yi5", "pebble lookup failed: database is locked"],
  ]);
  assert.deepEqual(plan.deferredBranches.map((branch) => [branch.issueId, branch.reason]), [
    ["dotfiles-zzz", "pebble was not found"],
  ]);
  assert.equal(plan.blockedIssueIds.has("dotfiles-yi5"), false);
  assert.equal(plan.blockedIssueIds.has("dotfiles-zzz"), true);
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
  assert.deepEqual(plan.ignoredBranches.map((branch) => [branch.issueId, branch.reason]), [
    ["dotfiles-yi5", "pebble status is in_review, not ready_for_agent"],
  ]);
  assert.deepEqual(plan.deferredBranches.map((branch) => [branch.issueId, branch.reason]), [
    ["dotfiles-yi5", "pebble status is in_review, not ready_for_agent"],
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

test("finds existing open PRs by pebble id instead of exact branch only", () => {
  const stdout = JSON.stringify([
    { number: 10, headRefName: "picastle/my-repo-abc-other-work", url: "https://github.com/acme/repo/pull/10" },
    { number: 11, headRefName: "picastle/dotfiles-abc-other-work", url: "https://github.com/acme/repo/pull/11" },
    { number: 12, headRefName: "picastle/dotfiles-yi5-resumable-idempotent-runs", url: "https://github.com/acme/repo/pull/12" },
  ]);

  assert.deepEqual(findOpenPrForIssue(stdout, "dotfiles-yi5"), {
    number: 12,
    headRefName: "picastle/dotfiles-yi5-resumable-idempotent-runs",
    url: "https://github.com/acme/repo/pull/12",
  });
  assert.equal(findOpenPrForIssue(stdout, "dotfiles-xyz"), undefined);
  assert.equal(findOpenPrForIssue(stdout, "my-repo"), undefined);
});

test("prefers exact known target issue id matching before heuristic PR branch extraction", () => {
  const stdout = JSON.stringify([
    { number: 20, headRefName: "picastle/web-api-abc-fix", url: "https://github.com/acme/repo/pull/20" },
  ]);

  assert.equal(extractIssueIdFromBranch("picastle/web-api-abc-fix"), "web-api");
  assert.deepEqual(findOpenPrForIssue(stdout, "web-api-abc"), {
    number: 20,
    headRefName: "picastle/web-api-abc-fix",
    url: "https://github.com/acme/repo/pull/20",
  });
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
