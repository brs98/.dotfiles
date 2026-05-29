import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertSafeRecoveryBranchName,
  buildRecoveryPlan,
  classifyPebShowFailure,
  decidePublishCommandBoundary,
  decidePublishFlow,
  extractIssueIdFromBranch,
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

test("prefers longest known issue id matching before heuristic PR branch extraction", () => {
  const stdout = JSON.stringify([
    { number: 20, headRefName: "picastle/web-api-abc-fix", url: "https://github.com/acme/repo/pull/20" },
  ]);
  const knownIssueIds = ["web-api", "web-api-abc"];

  assert.equal(extractIssueIdFromBranch("picastle/web-api-abc-fix"), "web-api");
  assert.equal(extractIssueIdFromBranch("picastle/web-api-abc-fix", knownIssueIds), "web-api-abc");
  assert.equal(findOpenPrForIssue(stdout, "web-api", { knownIssueIds }), undefined);
  assert.deepEqual(findOpenPrForIssue(stdout, "web-api-abc", { knownIssueIds }), {
    number: 20,
    headRefName: "picastle/web-api-abc-fix",
    url: "https://github.com/acme/repo/pull/20",
  });
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
  assert.doesNotMatch(readFileSync(pebLog, "utf8"), /\b(?:closes add|update)\b/);
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

test("default publisher-agent publish path reuses existing issue PR without duplicate PR creation", () => {
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
  execFileSync("git", ["checkout", "-b", "picastle/dotfiles-aaa-new-work"], { cwd: repo, encoding: "utf8" });
  writeFileSync(join(repo, "change.txt"), "publish me\n");
  execFileSync("git", ["add", "change.txt"], { cwd: repo, encoding: "utf8" });
  execFileSync("git", ["-c", "user.name=Picastle Test", "-c", "user.email=test@example.com", "commit", "-m", "change\n\nCloses: dotfiles-aaa"], {
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
  {"number":30,"headRefName":"sandcastle/dotfiles-aaa-existing-pr","url":"https://github.com/acme/repo/pull/30","isCrossRepository":false,"headRepositoryOwner":{"login":"acme"},"headRepository":{"name":"repo"}}
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
  printf '%s\n' '{"data":[{"id":"dotfiles-aaa"}]}'
  exit 0
fi
if [[ "$1 $2" == "show dotfiles-aaa" ]]; then
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
      PICASTLE_FAKE_AGENT_OUTPUT: '<review>{"status":"approved","summary":"ready","findings":[],"checks":[]}</review>',
    },
  });

  assert.match(output, /Review\/repair loop handling 1 completed branch\(es\)/);
  assert.match(output, /issue already has open PR on sandcastle\/dotfiles-aaa-existing-pr: https:\/\/github\.com\/acme\/repo\/pull\/30/);
  assert.doesNotMatch(readFileSync(ghLog, "utf8"), /\bpr create\b/);
  const pebTrace = readFileSync(pebLog, "utf8");
  assert.match(pebTrace, /closes add dotfiles-aaa --pr https:\/\/github\.com\/acme\/repo\/pull\/30/);
  assert.match(pebTrace, /update dotfiles-aaa --status in_review/);
});

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
      PICASTLE_FAKE_AGENT_OUTPUT: '<review>{"status":"approved","summary":"ready","findings":[],"checks":[]}</review>',
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

// Keep the pure publish-flow boundary locked down alongside the fake-agent
// runtime coverage above so both publisher paths agree on duplicate-PR avoidance.
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

test("recognizes successful and already-existing peb closure registration", () => {
  assert.equal(pebClosureRegistrationSucceeded({ status: 0, stdout: "", stderr: "" }), true);
  assert.equal(pebClosureRegistrationSucceeded({ status: 1, stdout: "closure already exists", stderr: "" }), true);
  assert.equal(pebClosureRegistrationSucceeded({ status: 1, stdout: "", stderr: "already-existing closure" }), true);
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
