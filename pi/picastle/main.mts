#!/usr/bin/env node
// Picastle — Pi SDK powered, host-worktree autonomous issue loop.
//
// Global, Docker-free version intended to live in ~/.dotfiles. It can be run
// from any git repo with pebbles, and adapts its queue defaults from that
// repo's pebbles-policy.json when present.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

import {
  buildRecoveryPlan,
  classifyPebShowFailure,
  extractIssueIdFromBranch,
  findOpenPrForIssue,
  normalizeOpenPrsJson,
  parseKnownIssueIdsJson,
  parseOpenPrsByHead,
  validatePlannedIssueSelections,
  type RecoveryBranchInput,
  type RecoveryIssueLookup,
  type RecoveryPlan,
} from "./recovery.mjs";

type PlannedIssue = { id: string; title: string; branch: string };
type CompletedIssue = PlannedIssue & { worktreePath: string };
type ReviewStatus = "approved" | "changes_requested" | "blocked";
type ReviewFinding = {
  severity?: string;
  file?: string | null;
  summary?: string;
  recommendation?: string;
};
type ReviewResult = {
  status: ReviewStatus;
  summary?: string;
  findings?: ReviewFinding[];
  checks?: string[];
};
type ShResult = { status: number; stdout: string; stderr: string };
type PebblesPolicy = {
  version?: number;
  strict?: boolean;
  groups?: Array<{ name?: string; cardinality?: string; labels?: string[] }>;
};
type QueuePolicy = {
  status: string;
  policyReadyLabel?: string;
  pendingStatus: string;
  pendingPolicyLabel?: string;
  reviewStatus: string;
  reviewPolicyLabel?: string;
};

const cli = parseArgs(process.argv.slice(2));
const scriptRoot = dirname(fileURLToPath(import.meta.url));
const startCwd = cli.repo ? resolve(cli.repo) : process.cwd();
const repoRoot = run("git rev-parse --show-toplevel", startCwd).stdout.trim();
const repoName = repoRoot.split("/").filter(Boolean).at(-1) ?? "repo";
const cacheRoot = process.env.XDG_CACHE_HOME || join(requireHome(), ".cache");
const runtimeDir = join(cacheRoot, "picastle", safeRepoId(repoRoot));
const logsDir = join(runtimeDir, "logs");
const worktreesDir = join(runtimeDir, "worktrees");
mkdirSync(logsDir, { recursive: true });
mkdirSync(worktreesDir, { recursive: true });

const policy = loadPebblesPolicy(repoRoot);
const queuePolicy = deriveQueuePolicy(policy);

const BASE_BRANCH = env("PICASTLE_BASE_BRANCH", cli.base ?? "main");
const ISSUE_STATUS = env("PICASTLE_ISSUE_STATUS", queuePolicy.status);
const ISSUE_LABEL = env("PICASTLE_ISSUE_LABEL", "");
const PENDING_STATUS = env("PICASTLE_PENDING_STATUS", queuePolicy.pendingStatus);
const REVIEW_STATUS = env("PICASTLE_REVIEW_STATUS", queuePolicy.reviewStatus);
const PEB_GLOBAL_ARGS = buildPebGlobalArgs();
const MAX_ITERATIONS = envNonNegativeInt("PICASTLE_MAX_ITERATIONS", cli.maxIterations ?? 10);
const MAX_ISSUES = envNonNegativeInt("PICASTLE_MAX_ISSUES", cli.maxIssues ?? 0);
const CONCURRENCY = envInt("PICASTLE_CONCURRENCY", cli.concurrency ?? 3);
const VERIFY = envBool("PICASTLE_VERIFY", !cli.noVerify);
const PLAN_ONLY = envBool("PICASTLE_PLAN_ONLY", cli.planOnly);
const REPAIR_ON_VERIFY_FAIL = envBool("PICASTLE_REPAIR_ON_VERIFY_FAIL", true);
const PUSH = envBool("PICASTLE_PUSH", !cli.noPush);
const OPEN_PRS = envBool("PICASTLE_OPEN_PRS", !cli.noPr);
const PUBLISHER_AGENT = envBool("PICASTLE_PUBLISHER_AGENT", true);
const REVIEW_REPAIR_CYCLES = envInt("PICASTLE_REVIEW_REPAIR_CYCLES", 10);
const REVIEW_CONCURRENCY = envInt("PICASTLE_REVIEW_CONCURRENCY", CONCURRENCY);
// gh pr list defaults to 30; no-cap Picastle runs can exceed that. Use a high
// bounded scan so recovery/planning usually sees in-flight Picastle PRs without
// implying this enumerates an unbounded repository PR history.
const OPEN_PR_SCAN_LIMIT = envInt("PICASTLE_OPEN_PR_SCAN_LIMIT", 1000);
const WORKTREE_READY_COMMAND = env("PICASTLE_WORKTREE_READY_COMMAND", "");
const BEFORE_PUSH_COMMAND = env("PICASTLE_BEFORE_PUSH_COMMAND", "");
const THINKING = process.env.PICASTLE_THINKING as
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | undefined;
const CLEAN_TARGETS = envBool("PICASTLE_CLEAN_TARGETS", cli.cleanTargets ?? false);
const MIN_FREE_GB = envNonNegativeNumber("PICASTLE_MIN_FREE_GB", cli.minFreeGb ?? 0);
const BYTES_PER_GIB = 1024 ** 3;

const authStorage = AuthStorage.create();
const modelRegistry = ModelRegistry.create(authStorage);

console.log(`Picastle repo: ${repoRoot}`);
console.log(`Picastle runtime: ${runtimeDir}`);
console.log(`Pebbles queue: status=${ISSUE_STATUS}${ISSUE_LABEL ? ` label=${ISSUE_LABEL}` : ""}`);
if (MIN_FREE_GB > 0) console.log(`Disk guardrail: require ${MIN_FREE_GB} GiB free`);
if (CLEAN_TARGETS) console.log("Disk cleanup: per-worktree target/ cleanup enabled");
checkMinFreeSpace("startup");

for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  checkMinFreeSpace(`iteration ${iteration} start`);
  console.log(`\n=== Picastle iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

  const recovery = recoverInterruptedRun();
  if (recovery.interruptedImplementations.length > 0) {
    console.log("Recovery has interrupted implementation work; resuming before planning new work.");
    const settled = await runWithConcurrency(recovery.interruptedImplementations, CONCURRENCY, (issue) =>
      implementIssue(issue, iteration),
    );
    const completed = settled.flatMap((outcome) => outcome.status === "fulfilled" && outcome.value ? [outcome.value] : []);
    for (const outcome of settled) {
      if (outcome.status === "rejected") console.error(`  ✗ recovery implementer failed: ${formatError(outcome.reason)}`);
    }
    if (completed.length > 0) {
      if (PUBLISHER_AGENT) await publishCompletedIssuesWithAgent(completed, iteration);
      else await publishCompletedIssues(completed, iteration);
    }
    runPendingFanIn();
    continue;
  }

  if (recovery.unpublishedBranches.length > 0) {
    console.log("Recovery has unpublished local branches; reviewing/publishing before planning new work.");
    if (PUBLISHER_AGENT) {
      await publishCompletedIssuesWithAgent(recovery.unpublishedBranches, iteration);
    } else {
      await publishCompletedIssues(recovery.unpublishedBranches, iteration);
    }
    runPendingFanIn();
    continue;
  }

  const issues = await planIssues(iteration, recovery.blockedIssueIds);
  if (issues.length === 0) {
    console.log("No unblocked issues to work on. Exiting.");
    break;
  }

  console.log(`Planning complete. ${issues.length} issue(s) selected:`);
  for (const issue of issues) {
    console.log(`  ${issue.id}: ${issue.title} → ${issue.branch}`);
  }

  if (PLAN_ONLY) {
    console.log("PICASTLE_PLAN_ONLY=1; stopping before worktree creation/implementation.");
    break;
  }

  const settled = await runWithConcurrency(issues, CONCURRENCY, (issue) =>
    implementIssue(issue, iteration),
  );

  const completed: CompletedIssue[] = [];
  for (const [i, outcome] of settled.entries()) {
    const issue = issues[i]!;
    if (outcome.status === "rejected") {
      console.error(`  ✗ ${issue.id} failed: ${formatError(outcome.reason)}`);
      continue;
    }
    if (outcome.value) completed.push(outcome.value);
  }

  console.log(`\nExecution complete. ${completed.length} branch(es) with commits:`);
  for (const issue of completed) console.log(`  ${issue.branch}`);

  if (completed.length > 0) {
    if (PUBLISHER_AGENT) {
      await publishCompletedIssuesWithAgent(completed, iteration);
    } else {
      await publishCompletedIssues(completed, iteration);
    }
  }

  runPendingFanIn();
}

console.log("\nPicastle done.");

function runPendingFanIn(): void {
  const fanIn = run(`bash ${shellQuote(join(scriptRoot, "scripts", "apply-pending-issues.sh"))}`, repoRoot, {
    stdio: "inherit",
    allowFailure: true,
    env: { PICASTLE_RUNTIME_DIR: runtimeDir, PICASTLE_PENDING_STATUS: PENDING_STATUS },
  });
  if (fanIn.status !== 0) {
    console.warn(
      `apply-pending-issues.sh exited with code ${fanIn.status}; inspect ${runtimeDir}/*.failed.jsonl`,
    );
  }
}

function recoverInterruptedRun(): RecoveryPlan & { unpublishedBranches: CompletedIssue[] } {
  const prune = run("git worktree prune --verbose", repoRoot, { allowFailure: true });
  if (prune.status !== 0) console.warn(`  ⚠ git worktree prune failed: ${prune.stderr || prune.stdout}`);
  else if (prune.stdout.trim()) console.log(`Recovery pruned stale worktree metadata:\n${prune.stdout.trim()}`);

  const branchInputs = collectRecoveryBranches();
  const plan = buildRecoveryPlan(branchInputs, ISSUE_STATUS);
  logRecoveryPlan(plan);

  for (const published of plan.alreadyPublished) {
    const closes = run(pebCommand(`closes add ${shellQuote(published.id)} --pr ${shellQuote(published.prUrl)}`), repoRoot, {
      allowFailure: true,
    });
    if (closes.status !== 0 && !/already/i.test(closes.stderr + closes.stdout)) {
      console.warn(`  ⚠ failed to declare pending pebble closure for ${published.id}: ${closes.stderr || closes.stdout}`);
    }
    markIssueInReview(published.id);
  }

  const unpublishedBranches = plan.unpublishedBranches.map((issue) => ({
    ...issue,
    worktreePath: issue.worktreePath ?? ensureBranchWorktree(issue.branch),
  }));

  return { ...plan, unpublishedBranches };
}

function collectRecoveryBranches(): RecoveryBranchInput[] {
  const worktrees = collectWorktreeEntries();
  const worktreeByBranch = new Map(worktrees.filter((entry) => entry.branch).map((entry) => [entry.branch!, entry]));
  const openPrByHead = loadOpenPrsByHead();
  const issueCache = new Map<string, { title?: string; status?: string; lookup: RecoveryIssueLookup } | undefined>();
  const knownIssueIds = loadKnownIssueIdsForRecovery();

  const localBranches = listLocalPicastleBranches();
  const localBranchNames = new Set(localBranches.map((branch) => branch.branch));
  const inputs: RecoveryBranchInput[] = localBranches.map((localBranch) => {
    const issueId = extractIssueIdFromBranch(localBranch.branch, knownIssueIds);
    const worktree = worktreeByBranch.get(localBranch.branch);
    const dirty = worktree?.path && existsSync(worktree.path)
      ? run("git status --porcelain", worktree.path).stdout.trim().length > 0
      : false;
    const aheadOutput = run(
      `git rev-list --count ${shellQuote(BASE_BRANCH)}..${shellQuote(localBranch.branch)}`,
      repoRoot,
    ).stdout.trim();
    const ahead = Number(aheadOutput);
    if (!Number.isFinite(ahead)) {
      throw new Error(`invalid git rev-list ahead count for ${localBranch.branch}: ${aheadOutput}`);
    }
    const issue = issueId ? readIssueForRecovery(issueId, issueCache) : undefined;
    return {
      branch: localBranch.branch,
      issueId,
      title: issue?.title,
      issueStatus: issue?.status,
      issueLookup: issue?.lookup,
      ahead,
      dirty,
      worktreePath: worktree?.path,
      openPrUrl: openPrByHead.get(localBranch.branch),
      commitTime: localBranch.commitTime,
    };
  });

  for (const [head, url] of openPrByHead) {
    if (!head.startsWith("picastle/") || localBranchNames.has(head)) continue;
    const issueId = extractIssueIdFromBranch(head, knownIssueIds);
    const issue = issueId ? readIssueForRecovery(issueId, issueCache) : undefined;
    inputs.push({
      branch: head,
      issueId,
      title: issue?.title,
      issueStatus: issue?.status,
      issueLookup: issue?.lookup,
      ahead: 0,
      dirty: false,
      openPrUrl: url,
    });
  }

  return inputs;
}

function listLocalPicastleBranches(): Array<{ branch: string; commitTime?: number }> {
  const result = run("git for-each-ref --format='%(refname:short)%00%(committerdate:unix)' refs/heads/picastle", repoRoot);
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [branch, commitTime] = line.split("\0");
      return { branch: branch!, commitTime: Number(commitTime) || undefined };
    });
}

function collectWorktreeEntries(): Array<{ path: string; branch?: string }> {
  return run("git worktree list --porcelain", repoRoot).stdout
    .split(/\n(?=worktree )/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((entry) => ({
      path: entry.match(/^worktree (.+)$/m)?.[1] ?? "",
      branch: entry.match(/^branch refs\/heads\/(.+)$/m)?.[1],
    }))
    .filter((entry) => entry.path);
}

function loadOpenPrsByHead(): Map<string, string> {
  const result = run(
    `gh pr list --state open --limit ${OPEN_PR_SCAN_LIMIT} --json headRefName,url`,
    repoRoot,
  );
  return parseOpenPrsByHead(result.stdout);
}

function loadExistingOpenPrForIssue(issueId: string): { headRefName: string; url: string } | undefined {
  const result = run(
    `gh pr list --state open --limit ${OPEN_PR_SCAN_LIMIT} --json headRefName,url`,
    repoRoot,
  );
  return findOpenPrForIssue(result.stdout, issueId);
}

function loadKnownIssueIdsForRecovery(): string[] {
  const result = run(pebCommand("list --json"), repoRoot, { allowFailure: true });
  if (result.status !== 0) {
    throw new Error(`peb issue id query failed during recovery; refusing heuristic issue-id extraction: ${result.stderr || result.stdout}`);
  }

  try {
    return parseKnownIssueIdsJson(result.stdout);
  } catch (error) {
    throw new Error(`failed to parse peb issue id query during recovery; refusing heuristic issue-id extraction: ${formatError(error)}`);
  }
}

function readIssueForRecovery(
  issueId: string,
  cache: Map<string, { title?: string; status?: string; lookup: RecoveryIssueLookup } | undefined>,
): { title?: string; status?: string; lookup: RecoveryIssueLookup } | undefined {
  if (cache.has(issueId)) return cache.get(issueId);
  const show = run(pebCommand(`show ${shellQuote(issueId)} --json`), repoRoot, { allowFailure: true });
  if (show.status !== 0) {
    const lookup = classifyPebShowFailure(show.stderr || show.stdout);
    const result = { lookup };
    cache.set(issueId, result);
    return result;
  }
  try {
    const issue = JSON.parse(show.stdout).data as { title?: string; status?: string };
    const result = { ...issue, lookup: { state: "found" } as const };
    cache.set(issueId, result);
    return result;
  } catch (error) {
    const result = {
      lookup: {
        state: "failed",
        message: `failed to parse peb show JSON for ${issueId}: ${formatError(error)}`,
      } as const,
    };
    cache.set(issueId, result);
    return result;
  }
}

function logRecoveryPlan(plan: RecoveryPlan): void {
  const zeroAhead = plan.ignoredBranches.filter((branch) => branch.reason === "zero commits ahead of base and clean").length;
  const ignoredOther = plan.ignoredBranches.length - zeroAhead;
  const active = plan.interruptedImplementations.length + plan.unpublishedBranches.length;
  if (active === 0 && plan.alreadyPublished.length === 0 && plan.deferredBranches.length === 0 && zeroAhead === 0) return;

  console.log(
    `Recovery scan: ${plan.interruptedImplementations.length} interrupted, ` +
      `${plan.unpublishedBranches.length} unpublished, ${plan.alreadyPublished.length} already published, ` +
      `${plan.deferredBranches.length} deferred, ${zeroAhead} zero-ahead ignored` +
      (ignoredOther > 0 ? `, ${ignoredOther} other ignored` : "") +
      ".",
  );
  for (const issue of plan.interruptedImplementations) {
    console.log(`  resume implement: ${issue.id} ${issue.branch}${issue.worktreePath ? ` (${issue.worktreePath})` : ""}`);
  }
  for (const issue of plan.unpublishedBranches) {
    console.log(`  publish: ${issue.id} ${issue.branch}${issue.worktreePath ? "" : " (orphan branch; attaching worktree)"}`);
  }
  for (const issue of plan.alreadyPublished) {
    console.log(`  published: ${issue.id} ${issue.branch} → ${issue.prUrl}`);
  }
  for (const branch of plan.deferredBranches) {
    console.warn(`  defer: ${branch.issueId} ${branch.branch}: ${branch.reason}`);
  }
}

async function planIssues(iteration: number, suppressedIssueIds: Set<string>): Promise<PlannedIssue[]> {
  const candidates = loadCandidateIssues(suppressedIssueIds);
  const issuesJson = JSON.stringify(candidates);

  const openPrsJson = normalizeOpenPrsJson(
    run(
      `gh pr list --state open --limit ${OPEN_PR_SCAN_LIMIT} --json number,headRefName,url`,
      repoRoot,
    ).stdout,
  );

  const prompt = renderPrompt("plan-prompt.md", {
    ISSUES_JSON: issuesJson,
    OPEN_PRS_JSON: openPrsJson,
    ISSUE_LABEL: ISSUE_LABEL || "<none>",
    ISSUE_STATUS,
    POLICY_READY_LABEL: queuePolicy.policyReadyLabel ?? "<none>",
    BASE_BRANCH,
    PEB_PREFIX: pebCommand("").trim(),
  });

  const stdout = await runPiAgent({
    name: `planner-${iteration}`,
    cwd: repoRoot,
    tools: ["read", "bash"],
    prompt,
    logFile: join(logsDir, `picastle-planner-${iteration}.log`),
  });

  const match = stdout.match(/<plan>([\s\S]*?)<\/plan>/);
  if (!match) {
    throw new Error(`Planner did not produce a <plan> block. See ${join(logsDir, `picastle-planner-${iteration}.log`)}`);
  }

  const parsed = JSON.parse(match[1]!);
  if (!parsed || !Array.isArray(parsed.issues)) {
    throw new Error("Planner <plan> JSON must contain an issues array");
  }

  const planned = validatePlannedIssueSelections(parsed.issues, candidates, {
    suppressedIssueIds,
    normalizeBranch,
  });

  return MAX_ISSUES > 0 ? planned.slice(0, MAX_ISSUES) : planned;
}

function loadCandidateIssues(suppressedIssueIds = new Set<string>()): unknown[] {
  const byId = new Map<string, unknown>();
  const add = (items: unknown[]) => {
    for (const item of items) {
      const id = typeof item === "object" && item && "id" in item ? String((item as { id: unknown }).id) : "";
      if (id && !suppressedIssueIds.has(id) && !byId.has(id)) byId.set(id, item);
    }
  };

  const issueFilters = [
    `--status ${shellQuote(ISSUE_STATUS)}`,
    ISSUE_LABEL ? `--label ${shellQuote(ISSUE_LABEL)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  add(readIssues(`${pebCommand(`list ${issueFilters} --json`)} | jq '[.data[] | {id, title, body: .description, status, labels, comments, dependencies}]'`));

  // Compatibility with older repos that modeled workflow state as a policy
  // label on otherwise-open issues. If the policy says the ready label is
  // `ready-for-agent`, include `--status open --label ready-for-agent` too.
  if (queuePolicy.policyReadyLabel && envBool("PICASTLE_INCLUDE_POLICY_LABEL_QUEUE", true)) {
    const legacyFilters = [
      "--status open",
      `--label ${shellQuote(queuePolicy.policyReadyLabel)}`,
      ISSUE_LABEL && ISSUE_LABEL !== queuePolicy.policyReadyLabel ? `--label ${shellQuote(ISSUE_LABEL)}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    add(readIssues(`${pebCommand(`list ${legacyFilters} --json`)} | jq '[.data[] | {id, title, body: .description, status, labels, comments, dependencies}]'`));
  }

  return [...byId.values()];
}

function readIssues(command: string): unknown[] {
  const result = run(command, repoRoot, { allowFailure: true });
  if (result.status !== 0) {
    console.warn(`  ⚠ peb issue query failed: ${result.stderr || result.stdout}`);
    return [];
  }
  return JSON.parse(result.stdout || "[]");
}

async function implementIssue(
  issue: PlannedIssue,
  iteration: number,
): Promise<CompletedIssue | undefined> {
  const worktreePath = ensureIssueWorktree(issue);
  let keepArtifactsForPublish = false;

  try {
    checkMinFreeSpace(`${issue.id} before implementer`);
    const recentCommits = run("git log -n 10 --format='%H%n%ad%n%B---' --date=short", worktreePath).stdout;
    const issueJson = run(pebCommand(`show ${shellQuote(issue.id)} --json`), worktreePath).stdout;

    const prompt = renderPrompt("implement-prompt.md", {
      TASK_ID: issue.id,
      ISSUE_TITLE: issue.title,
      BRANCH: issue.branch,
      BASE_BRANCH,
      ISSUE_JSON: issueJson.trim(),
      RECENT_COMMITS: recentCommits.trim(),
      PEB_PREFIX: pebCommand("").trim(),
      PEB_SHOW_TASK: pebCommand(`show ${shellQuote(issue.id)}`),
      PENDING_STATUS,
    });

    await runPiAgent({
      name: `implementer-${issue.id}`,
      cwd: worktreePath,
      tools: ["read", "bash", "edit", "write"],
      prompt,
      logFile: join(logsDir, `picastle-${issue.id}-implementer.log`),
    });

    const dirty = run("git status --porcelain", worktreePath).stdout.trim();
    if (dirty) {
      console.warn(`  ⚠ ${issue.id}: worktree has uncommitted changes after implementer run`);
    }

    const ahead = Number(run(`git rev-list --count ${shellQuote(BASE_BRANCH)}..HEAD`, worktreePath).stdout.trim() || "0");
    if (ahead <= 0) {
      console.log(`  - ${issue.id}: no commits produced`);
      return undefined;
    }

    keepArtifactsForPublish = true;
    return { ...issue, worktreePath };
  } finally {
    if (!keepArtifactsForPublish) cleanWorktreeTarget(worktreePath, issue.id);
  }
}


async function publishCompletedIssuesWithAgent(
  completed: CompletedIssue[],
  iteration: number,
): Promise<void> {
  console.log(
    `\n==> Review/repair loop handling ${completed.length} completed branch(es) with concurrency ${REVIEW_CONCURRENCY}`,
  );

  const settled = await runWithConcurrency(completed, REVIEW_CONCURRENCY, async (issue) => {
    try {
      const approved = await reviewIssueUntilApproved(issue, iteration);
      if (!approved) return { issue, published: false };
      await publishApprovedIssue(issue);
      return { issue, published: true };
    } finally {
      cleanWorktreeTarget(issue.worktreePath, issue.id);
    }
  });

  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      console.error(`  ✗ review/publish worker failed: ${formatError(outcome.reason)}`);
    } else if (!outcome.value.published) {
      console.warn(`  - ${outcome.value.issue.id}: not published`);
    }
  }
}

async function reviewIssueUntilApproved(
  issue: CompletedIssue,
  iteration: number,
): Promise<boolean> {
  for (let pass = 1; pass <= REVIEW_REPAIR_CYCLES; pass++) {
    console.log(`\n==> Reviewing ${issue.id} (${issue.branch}), pass ${pass}/${REVIEW_REPAIR_CYCLES}`);
    const review = await reviewCompletedIssue(issue, iteration, pass);

    if (review.status === "approved") {
      console.log(`  ✓ reviewer approved ${issue.id}: ${review.summary ?? "ready"}`);
      return true;
    }

    if (review.status === "blocked") {
      const body = [
        `Picastle reviewer blocked ${issue.branch}.`,
        "",
        review.summary ?? "No summary provided.",
        "",
        ...formatReviewFindings(review),
      ].join("\n");
      writePendingComment(issue.worktreePath, issue.id, body);
      console.warn(`  ✗ reviewer blocked ${issue.id}; pending comment recorded`);
      return false;
    }

    console.log(`  ↻ reviewer requested changes for ${issue.id}: ${review.summary ?? "changes requested"}`);
    await repairFromReview(issue, review, iteration, pass);
  }

  writePendingComment(
    issue.worktreePath,
    issue.id,
    `Picastle review did not reach approval after ${REVIEW_REPAIR_CYCLES} review/repair cycles.`,
  );
  console.warn(`  ✗ ${issue.id} exhausted ${REVIEW_REPAIR_CYCLES} review/repair cycles`);
  return false;
}

async function reviewCompletedIssue(
  issue: CompletedIssue,
  iteration: number,
  pass: number,
): Promise<ReviewResult> {
  const issueJson = run(pebCommand(`show ${shellQuote(issue.id)} --json`), issue.worktreePath).stdout;
  const prompt = renderPrompt("review-prompt.md", {
    TASK_ID: issue.id,
    ISSUE_TITLE: issue.title,
    BRANCH: issue.branch,
    BASE_BRANCH,
    WORKTREE_PATH: issue.worktreePath,
    ISSUE_JSON: issueJson.trim(),
    PEB_PREFIX: pebCommand("").trim(),
    VERIFY: String(VERIFY),
    REVIEW_PASS: String(pass),
    MAX_REVIEW_CYCLES: String(REVIEW_REPAIR_CYCLES),
  });

  const stdout = await runPiAgent({
    name: `reviewer-${issue.id}-${pass}`,
    cwd: issue.worktreePath,
    tools: ["read", "bash"],
    prompt,
    logFile: join(logsDir, `picastle-${issue.id}-review-${iteration}-${pass}.log`),
  });

  const match = stdout.match(/<review>([\s\S]*?)<\/review>/);
  if (!match) {
    return {
      status: "changes_requested",
      summary: `Reviewer did not emit a <review> block; see ${join(logsDir, `picastle-${issue.id}-review-${iteration}-${pass}.log`)}`,
      findings: [
        {
          severity: "blocking",
          file: null,
          summary: "Reviewer output was not machine-readable.",
          recommendation: "Inspect the review log and make the output conform to the review schema.",
        },
      ],
      checks: [],
    };
  }

  return normalizeReviewResult(JSON.parse(match[1]!));
}

async function repairFromReview(
  issue: CompletedIssue,
  review: ReviewResult,
  iteration: number,
  pass: number,
): Promise<void> {
  const issueJson = run(pebCommand(`show ${shellQuote(issue.id)} --json`), issue.worktreePath).stdout;
  const prompt = renderPrompt("repair-prompt.md", {
    TASK_ID: issue.id,
    ISSUE_TITLE: issue.title,
    BRANCH: issue.branch,
    BASE_BRANCH,
    ISSUE_JSON: issueJson.trim(),
    REVIEW_JSON: JSON.stringify(review, null, 2),
  });

  await runPiAgent({
    name: `review-repair-${issue.id}-${pass}`,
    cwd: issue.worktreePath,
    tools: ["read", "bash", "edit", "write"],
    prompt,
    logFile: join(logsDir, `picastle-${issue.id}-review-repair-${iteration}-${pass}.log`),
  });
}

async function publishApprovedIssue(issue: CompletedIssue): Promise<void> {
  console.log(`\n==> Publishing approved branch ${issue.id} (${issue.branch})`);

  const existingPr = loadExistingOpenPrForIssue(issue.id);
  if (existingPr) {
    console.log(`  issue already has open PR on ${existingPr.headRefName}: ${existingPr.url}`);
    const closes = run(pebCommand(`closes add ${shellQuote(issue.id)} --pr ${shellQuote(existingPr.url)}`), repoRoot, {
      allowFailure: true,
    });
    if (closes.status !== 0 && !/already/i.test(closes.stderr + closes.stdout)) {
      console.warn(`  ⚠ failed to declare pending pebble closure for ${issue.id}: ${closes.stderr || closes.stdout}`);
    }
    markIssueInReview(issue.id);
    return;
  }

  if (PUSH) {
    runWorktreeReadyHook(issue.worktreePath);
    if (BEFORE_PUSH_COMMAND) {
      console.log(`  before-push: ${BEFORE_PUSH_COMMAND}`);
      run(BEFORE_PUSH_COMMAND, issue.worktreePath, { stdio: "inherit" });
    }
    run(`git push -u origin ${shellQuote(issue.branch)}`, issue.worktreePath, {
      stdio: "inherit",
    });
  } else {
    console.log("PICASTLE_PUSH=0; skipping git push");
  }

  if (!OPEN_PRS) {
    console.log("PICASTLE_OPEN_PRS=0; skipping PR creation");
    return;
  }

  const prBody = buildPrBody(issue);
  const bodyFile = join(logsDir, `pr-body-${issue.id}.md`);
  mkdirSync(dirname(bodyFile), { recursive: true });
  writeFileSync(bodyFile, prBody);
  const prCreate = run(
    `gh pr create --base ${shellQuote(BASE_BRANCH)} --head ${shellQuote(issue.branch)} --title ${shellQuote(prTitle(issue))} --body-file ${shellQuote(bodyFile)}`,
    issue.worktreePath,
  );
  process.stdout.write(prCreate.stdout);
  process.stderr.write(prCreate.stderr);
  const prRef = extractPrRef(prCreate.stdout) || extractPrRef(prCreate.stderr);
  if (!prRef) {
    console.warn(`  ⚠ could not detect PR URL/number for ${issue.id}; skipping peb closes add`);
    return;
  }

  const closes = run(pebCommand(`closes add ${shellQuote(issue.id)} --pr ${shellQuote(prRef)}`), repoRoot, {
    allowFailure: true,
  });
  if (closes.status !== 0) {
    console.warn(`  ⚠ failed to declare pending pebble closure for ${issue.id}: ${closes.stderr || closes.stdout}`);
  }
  markIssueInReview(issue.id);
}

function normalizeReviewResult(value: unknown): ReviewResult {
  if (!value || typeof value !== "object") {
    throw new Error("review result must be an object");
  }
  const record = value as Record<string, unknown>;
  const status = record.status;
  if (status !== "approved" && status !== "changes_requested" && status !== "blocked") {
    throw new Error(`invalid review status: ${String(status)}`);
  }
  return {
    status,
    summary: typeof record.summary === "string" ? record.summary : undefined,
    findings: Array.isArray(record.findings) ? (record.findings as ReviewFinding[]) : [],
    checks: Array.isArray(record.checks) ? record.checks.map(String) : [],
  };
}

function formatReviewFindings(review: ReviewResult): string[] {
  const findings = review.findings ?? [];
  if (findings.length === 0) return [];
  return findings.map((finding, index) => {
    const file = finding.file ? ` (${finding.file})` : "";
    const recommendation = finding.recommendation ? `\n  Recommendation: ${finding.recommendation}` : "";
    return `${index + 1}. [${finding.severity ?? "finding"}]${file} ${finding.summary ?? "No summary."}${recommendation}`;
  });
}

async function publishCompletedIssues(
  completed: CompletedIssue[],
  iteration: number,
): Promise<void> {
  for (const issue of completed) {
    try {
      console.log(`\n==> Publishing ${issue.id} (${issue.branch})`);

      const existingPr = loadExistingOpenPrForIssue(issue.id);
      if (existingPr) {
        console.log(`  issue already has open PR on ${existingPr.headRefName}: ${existingPr.url}`);
        const closes = run(pebCommand(`closes add ${shellQuote(issue.id)} --pr ${shellQuote(existingPr.url)}`), repoRoot, {
          allowFailure: true,
        });
        if (closes.status !== 0 && !/already/i.test(closes.stderr + closes.stdout)) {
          console.warn(`  ⚠ failed to declare pending pebble closure for ${issue.id}: ${closes.stderr || closes.stdout}`);
        }
        markIssueInReview(issue.id);
        continue;
      }

      if (VERIFY) {
      let verified = verifyWorktree(issue.worktreePath);
      if (!verified.ok && REPAIR_ON_VERIFY_FAIL) {
        console.warn("  verification failed; asking Pi to repair once");
        await repairVerificationFailure(issue, verified.output, iteration);
        verified = verifyWorktree(issue.worktreePath);
      }
      if (!verified.ok) {
        console.error(`  ✗ verification still failing; leaving branch unpushed: ${issue.branch}`);
        writePendingComment(
          issue.worktreePath,
          issue.id,
          `Picastle produced commits on ${issue.branch}, but verification failed before PR creation.\n\n\`\`\`\n${truncate(verified.output, 6000)}\n\`\`\``,
        );
        continue;
      }
    }

    if (PUSH) {
      if (BEFORE_PUSH_COMMAND) {
        console.log(`  before-push: ${BEFORE_PUSH_COMMAND}`);
        run(BEFORE_PUSH_COMMAND, issue.worktreePath, { stdio: "inherit" });
      }
      run(`git push -u origin ${shellQuote(issue.branch)}`, issue.worktreePath, {
        stdio: "inherit",
      });
    } else {
      console.log("PICASTLE_PUSH=0; skipping git push");
    }

    if (OPEN_PRS) {
      const prBody = buildPrBody(issue);
      const bodyFile = join(logsDir, `pr-body-${issue.id}.md`);
      mkdirSync(dirname(bodyFile), { recursive: true });
      writeFileSync(bodyFile, prBody);
      const prCreate = run(
        `gh pr create --base ${shellQuote(BASE_BRANCH)} --head ${shellQuote(issue.branch)} --title ${shellQuote(prTitle(issue))} --body-file ${shellQuote(bodyFile)}`,
        issue.worktreePath,
      );
      process.stdout.write(prCreate.stdout);
      process.stderr.write(prCreate.stderr);
      const prRef = extractPrRef(prCreate.stdout) || extractPrRef(prCreate.stderr);
      if (prRef) {
        const closes = run(pebCommand(`closes add ${shellQuote(issue.id)} --pr ${shellQuote(prRef)}`), repoRoot, {
          allowFailure: true,
        });
        if (closes.status !== 0) {
          console.warn(`  ⚠ failed to declare pending pebble closure for ${issue.id}: ${closes.stderr || closes.stdout}`);
        }
        markIssueInReview(issue.id);
      } else {
        console.warn(`  ⚠ could not detect PR URL/number for ${issue.id}; skipping peb closes add`);
      }
      } else {
        console.log("PICASTLE_OPEN_PRS=0; skipping PR creation");
      }
    } finally {
      cleanWorktreeTarget(issue.worktreePath, issue.id);
    }
  }
}


function markIssueInReview(issueId: string): void {
  if (!REVIEW_STATUS) return;
  const result = run(pebCommand(`update ${shellQuote(issueId)} --status ${shellQuote(REVIEW_STATUS)}`), repoRoot, {
    allowFailure: true,
  });
  if (result.status !== 0) {
    console.warn(`  ⚠ failed to mark ${issueId} ${REVIEW_STATUS}: ${result.stderr || result.stdout}`);
  }
}

function verifyWorktree(worktreePath: string): { ok: boolean; output: string } {
  checkMinFreeSpace("before verification");
  const changed = run(`git diff --name-only ${shellQuote(BASE_BRANCH)}...HEAD`, worktreePath).stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const touchesUi = changed.some((path) => path.startsWith("ui/"));
  const touchesRust = changed.some(
    (path) =>
      path.endsWith(".rs") ||
      path === "Cargo.toml" ||
      path === "Cargo.lock" ||
      path.startsWith("crates/"),
  );

  const commands: string[] = [];
  if (touchesRust) {
    commands.push("cargo fmt --check");
    commands.push("cargo clippy -- -D warnings");
    commands.push("cargo test");
  }
  if (touchesUi) {
    commands.push("cd ui && npm run lint && npm run build && npm run test");
  }

  if (commands.length === 0) {
    commands.push("git status --porcelain");
  }

  let output = "";
  for (const command of commands) {
    checkMinFreeSpace(`before verification command: ${command}`);
    console.log(`  verifying: ${command}`);
    const result = run(command, worktreePath, { allowFailure: true });
    output += `$ ${command}\n${result.stdout}${result.stderr}\n`;
    if (result.status !== 0) return { ok: false, output };
  }
  return { ok: true, output };
}

async function repairVerificationFailure(
  issue: CompletedIssue,
  failureOutput: string,
  iteration: number,
): Promise<void> {
  const prompt = `Fix verification failures for ${issue.id}: ${issue.title}.

You are on branch ${issue.branch} in a dedicated host git worktree. Do not change pebbles state directly.

The verifier failed with:

\`\`\`
${truncate(failureOutput, 12000)}
\`\`\`

Make the smallest code/test fix, rerun the failing check, and commit your fix. The commit message must include a final trailer:

Closes: ${issue.id}

If the failure is environmental and cannot be fixed in code, append a pending comment with the reason to .picastle/pending-comments.jsonl and do not commit unrelated changes.

When done, output <promise>COMPLETE</promise>.`;

  await runPiAgent({
    name: `repair-${issue.id}`,
    cwd: issue.worktreePath,
    tools: ["read", "bash", "edit", "write"],
    prompt,
    logFile: join(logsDir, `picastle-${issue.id}-repair-${iteration}.log`),
  });
}

async function runPiAgent(args: {
  name: string;
  cwd: string;
  tools: string[];
  prompt: string;
  logFile: string;
}): Promise<string> {
  checkMinFreeSpace(`${args.name} before agent`);
  mkdirSync(dirname(args.logFile), { recursive: true });
  writeFileSync(args.logFile, `# ${args.name}\n# cwd: ${args.cwd}\n\n`);

  const { session } = await createAgentSession({
    cwd: args.cwd,
    tools: args.tools,
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.inMemory(args.cwd),
    ...(THINKING ? { thinkingLevel: THINKING } : {}),
  });

  let assistantText = "";
  const unsubscribe = session.subscribe((event: any) => {
    const line = serializeEvent(event);
    if (line) append(args.logFile, line + "\n");

    if (
      event?.type === "message_update" &&
      event?.assistantMessageEvent?.type === "text_delta"
    ) {
      const delta = event.assistantMessageEvent.delta ?? "";
      assistantText += delta;
      process.stdout.write(delta);
    }
  });

  try {
    await session.prompt(args.prompt);
    process.stdout.write("\n");
    return assistantText;
  } finally {
    unsubscribe();
    session.dispose();
  }
}

function ensureIssueWorktree(issue: PlannedIssue): string {
  const branch = normalizeBranch(issue.branch, issue.id, issue.title);
  return ensureBranchWorktree(branch);
}

function ensureBranchWorktree(branch: string): string {
  const existing = collectWorktreeEntries().find((entry) => entry.branch === branch && existsSync(entry.path));
  if (existing) return existing.path;

  mkdirSync(worktreesDir, { recursive: true });
  const worktreePath = availableWorktreePath(branch);
  const branchExists = run(`git rev-parse --verify ${shellQuote(branch)}`, repoRoot, {
    allowFailure: true,
  }).status === 0;

  if (branchExists) {
    run(`git worktree add ${shellQuote(worktreePath)} ${shellQuote(branch)}`, repoRoot, {
      stdio: "inherit",
    });
  } else {
    run(
      `git worktree add -b ${shellQuote(branch)} ${shellQuote(worktreePath)} ${shellQuote(BASE_BRANCH)}`,
      repoRoot,
      { stdio: "inherit" },
    );
  }

  runWorktreeReadyHook(worktreePath);
  return worktreePath;
}

function availableWorktreePath(branch: string): string {
  const worktreeName = branch.replace(/^picastle\//, "").replace(/[^a-zA-Z0-9._-]/g, "-");
  const preferred = join(worktreesDir, worktreeName);
  if (!existsSync(preferred)) return preferred;
  const currentBranch = run("git branch --show-current", preferred, { allowFailure: true }).stdout.trim();
  if (currentBranch === branch) return preferred;
  for (let index = 2; ; index++) {
    const candidate = `${preferred}-${index}`;
    if (!existsSync(candidate)) return candidate;
  }
}

function runWorktreeReadyHook(worktreePath: string): void {
  if (!WORKTREE_READY_COMMAND) return;
  checkMinFreeSpace("before worktree-ready hook");
  const marker = join(worktreePath, ".picastle", `worktree-ready-${hashString(WORKTREE_READY_COMMAND)}.done`);
  if (existsSync(marker)) return;
  console.log(`  worktree-ready: ${WORKTREE_READY_COMMAND}`);
  run(WORKTREE_READY_COMMAND, worktreePath, { stdio: "inherit" });
  mkdirSync(dirname(marker), { recursive: true });
  writeFileSync(marker, new Date().toISOString());
}

function renderPrompt(fileName: string, values: Record<string, string>): string {
  let prompt = readFileSync(join(scriptRoot, "prompts", fileName), "utf8");
  for (const [key, value] of Object.entries(values)) {
    prompt = prompt.split(`{{${key}}}`).join(value);
  }
  const unresolved = prompt.match(/{{[A-Z0-9_]+}}/g);
  if (unresolved) throw new Error(`Unresolved prompt placeholders in ${fileName}: ${unresolved.join(", ")}`);
  return prompt;
}

function loadPebblesPolicy(root: string): PebblesPolicy | undefined {
  const path = join(root, "pebbles-policy.json");
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PebblesPolicy;
  } catch (error) {
    console.warn(`  ⚠ failed to parse pebbles-policy.json: ${formatError(error)}`);
    return undefined;
  }
}

function deriveQueuePolicy(policy: PebblesPolicy | undefined): QueuePolicy {
  const labels = (policy?.groups ?? []).flatMap((group) => group.labels ?? []);
  const stateGroup = (policy?.groups ?? []).find(
    (group) =>
      group.name === "state" ||
      group.name === "status" ||
      (group.labels ?? []).some((label) => /ready[-_]for[-_]agent/i.test(label)),
  );
  const stateLabels = stateGroup?.labels ?? labels;
  const readyLabel =
    stateLabels.find((label) => label === "ready-for-agent" || label === "ready_for_agent") ??
    stateLabels.find((label) => /ready[-_]for[-_]agent/i.test(label));
  const pendingLabel =
    stateLabels.find((label) => label === "needs-triage" || label === "needs_triage") ??
    stateLabels.find((label) => /needs[-_]triage/i.test(label));
  const reviewLabel =
    stateLabels.find((label) => label === "in-review" || label === "in_review") ??
    stateLabels.find((label) => /in[-_]review/i.test(label));
  return {
    status: normalizePolicyStatus(readyLabel ?? "ready_for_agent"),
    policyReadyLabel: readyLabel,
    pendingStatus: normalizePolicyStatus(pendingLabel ?? "needs_triage"),
    pendingPolicyLabel: pendingLabel,
    reviewStatus: normalizePolicyStatus(reviewLabel ?? "in_review"),
    reviewPolicyLabel: reviewLabel,
  };
}

function normalizePolicyStatus(value: string): string {
  return value.trim().toLowerCase().replace(/-/g, "_");
}

function normalizeBranch(branch: string, id: string, title: string): string {
  if (branch.startsWith("picastle/")) return branch;
  if (branch.startsWith("sandcastle/")) return branch.replace(/^sandcastle\//, "picastle/");
  return `picastle/${id}-${slugify(title)}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/^[a-z]+\([^)]+\):\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "issue";
}

function prTitle(issue: PlannedIssue): string {
  return issue.title.length <= 70 ? issue.title : `${issue.title.slice(0, 67)}...`;
}

function buildPrBody(issue: CompletedIssue): string {
  return `> *This PR was produced by an autonomous Picastle run from the agent brief on pebbles issue ${issue.id}.*

## Summary

Implements the Picastle-selected pebbles issue:

- ${issue.id}: ${issue.title}

Review the original brief with:

\`\`\`bash
${pebCommand(`show ${shellQuote(issue.id)}`)}
\`\`\`

## Verification

Picastle ran the configured verification step for the files changed by this branch before opening the PR.

Closes: ${issue.id}
`;
}

function writePendingComment(worktreePath: string, id: string, body: string): void {
  const manifest = join(worktreePath, ".picastle", "pending-comments.jsonl");
  mkdirSync(dirname(manifest), { recursive: true });
  append(manifest, JSON.stringify({ id, body }) + "\n");
}

function checkMinFreeSpace(context: string): void {
  if (MIN_FREE_GB <= 0) return;
  const freeBytes = freeBytesFor(runtimeDir);
  const freeGib = freeBytes / BYTES_PER_GIB;
  if (freeGib >= MIN_FREE_GB) return;
  throw new Error(
    `Picastle refusing to continue during ${context}: ${freeGib.toFixed(1)} GiB free, below ` +
      `PICASTLE_MIN_FREE_GB=${MIN_FREE_GB}. Clean artifacts or lower concurrency before retrying.`,
  );
}

function freeBytesFor(path: string): number {
  const stats = statfsSync(path);
  return Number(stats.bavail) * Number(stats.bsize);
}

function cleanWorktreeTarget(worktreePath: string, issueId: string): void {
  if (!CLEAN_TARGETS) return;
  const resolvedWorktreesDir = resolve(worktreesDir);
  const resolvedWorktreePath = resolve(worktreePath);
  if (
    resolvedWorktreePath !== resolvedWorktreesDir &&
    !resolvedWorktreePath.startsWith(`${resolvedWorktreesDir}/`)
  ) {
    console.warn(`  ⚠ ${issueId}: refusing to clean target outside Picastle runtime: ${worktreePath}`);
    return;
  }

  const targetDir = join(resolvedWorktreePath, "target");
  if (!existsSync(targetDir)) return;
  const size = run(`du -sh ${shellQuote(targetDir)} | awk '{print $1}'`, repoRoot, {
    allowFailure: true,
  }).stdout.trim() || "unknown size";
  console.log(`  cleaning ${issueId} target/ (${size})`);
  rmSync(targetDir, { recursive: true, force: true });
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await fn(items[index]!) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function run(
  command: string,
  cwd: string,
  opts: { allowFailure?: boolean; stdio?: "pipe" | "inherit"; env?: Record<string, string> } = {},
): ShResult {
  const result = spawnSync("bash", ["-lc", command], {
    cwd,
    encoding: "utf8",
    stdio: opts.stdio === "inherit" ? "inherit" : "pipe",
    maxBuffer: 1024 * 1024 * 20,
    env: { ...process.env, ...(opts.env ?? {}) },
  });
  const status = result.status ?? 1;
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  if (status !== 0 && !opts.allowFailure) {
    throw new Error(`command failed (${status}): ${command}\n${stdout}${stderr}`);
  }
  return { status, stdout, stderr };
}

function extractPrRef(output: string): string | undefined {
  const url = output.match(/https:\/\/github\.com\/\S+\/pull\/\d+/)?.[0];
  if (url) return url;
  const number = output.match(/#(\d+)/)?.[1];
  return number;
}

function buildPebGlobalArgs(): string {
  const parts: string[] = [];
  if (process.env.PICASTLE_PEB_ARGS) parts.push(process.env.PICASTLE_PEB_ARGS);
  if (process.env.PICASTLE_PEB_REMOTE) {
    parts.push("--remote", shellQuote(process.env.PICASTLE_PEB_REMOTE));
  }
  if (process.env.PICASTLE_PEB_REPO) {
    parts.push("-R", shellQuote(process.env.PICASTLE_PEB_REPO));
  }
  return parts.join(" ");
}

function pebCommand(subcommand: string): string {
  return ["peb", PEB_GLOBAL_ARGS, subcommand].filter(Boolean).join(" ");
}

function parseArgs(args: string[]): {
  repo?: string;
  planOnly: boolean;
  noVerify: boolean;
  noPush: boolean;
  noPr: boolean;
  cleanTargets?: boolean;
  maxIterations?: number;
  maxIssues?: number;
  concurrency?: number;
  minFreeGb?: number;
  base?: string;
} {
  const parsed = { planOnly: false, noVerify: false, noPush: false, noPr: false } as ReturnType<typeof parseArgs>;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const next = () => args[++i] ?? die(`missing value for ${arg}`);
    if (arg === "--repo" || arg === "-C") parsed.repo = next();
    else if (arg === "--plan-only") parsed.planOnly = true;
    else if (arg === "--no-verify") parsed.noVerify = true;
    else if (arg === "--no-push") parsed.noPush = true;
    else if (arg === "--no-pr") parsed.noPr = true;
    else if (arg === "--clean-targets") parsed.cleanTargets = true;
    else if (arg === "--max-iterations") parsed.maxIterations = Number(next());
    else if (arg === "--max-issues") parsed.maxIssues = Number(next());
    else if (arg === "--concurrency") parsed.concurrency = Number(next());
    else if (arg === "--min-free-gb") parsed.minFreeGb = Number(next());
    else if (arg === "--base") parsed.base = next();
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: picastle [--repo PATH] [--plan-only] [--max-iterations N] [--max-issues N] [--concurrency N] [--min-free-gb N] [--base BRANCH] [--clean-targets] [--no-verify] [--no-push] [--no-pr]\n\nEnvironment: PICASTLE_PEB_REMOTE, PICASTLE_PEB_REPO, PICASTLE_ISSUE_STATUS, PICASTLE_ISSUE_LABEL, PICASTLE_MAX_ISSUES, PICASTLE_PENDING_STATUS, PICASTLE_REVIEW_STATUS, PICASTLE_PLAN_ONLY, PICASTLE_VERIFY, PICASTLE_PUSH, PICASTLE_OPEN_PRS, PICASTLE_PUBLISHER_AGENT, PICASTLE_REVIEW_REPAIR_CYCLES, PICASTLE_REVIEW_CONCURRENCY, PICASTLE_WORKTREE_READY_COMMAND, PICASTLE_BEFORE_PUSH_COMMAND, PICASTLE_CLEAN_TARGETS, PICASTLE_MIN_FREE_GB, PICASTLE_THINKING`);
      process.exit(0);
    } else {
      die(`unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function die(message: string): never {
  console.error(message);
  process.exit(2);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function env(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function envNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function envNonNegativeNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return !["0", "false", "no", "off"].includes(raw.toLowerCase());
}

function append(path: string, text: string): void {
  writeFileSync(path, text, { flag: "a" });
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n... truncated ...`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function serializeEvent(event: any): string | undefined {
  if (
    event?.type === "message_update" &&
    event?.assistantMessageEvent?.type === "text_delta"
  ) {
    return event.assistantMessageEvent.delta;
  }
  if (event?.type === "tool_call") {
    return `[tool_call] ${event.toolName ?? "unknown"}`;
  }
  if (event?.type === "tool_result") {
    return `[tool_result] ${event.toolName ?? "unknown"}`;
  }
  return undefined;
}

function hashString(input: string): string {
  let hash = 5381;
  for (const char of input) hash = ((hash << 5) + hash + char.charCodeAt(0)) >>> 0;
  return hash.toString(36);
}

function safeRepoId(root: string): string {
  return root.replace(/^\//, "").replace(/[^a-zA-Z0-9._-]+/g, "-");
}

function requireHome(): string {
  if (!process.env.HOME) throw new Error("HOME is not set");
  return process.env.HOME;
}
