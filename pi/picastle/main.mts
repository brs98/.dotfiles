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
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";

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
  parseKnownIssueIdsJson,
  selectRecoveryActions,
  validatePlannedIssueSelections,
  type RecoveryBranchInput,
  type RecoveryIssue,
  type RecoveryIssueLookup,
  type RecoveryPlan,
  type RepositoryIdentity,
} from "./recovery.mts";
import {
  formatPlannerBlockedSummary,
  normalizeBranch,
  parsePlannerContext,
  parsePlannerPlan,
  type PlannedIssue,
  type PlannerDecision,
} from "./planner-output.mts";
import { createReviewerAgentTooling, createReviewerResourceLoader } from "./review-session.mts";
import {
  parseStackMetadataFromBody,
  parseStackMetadataJson,
  planStackRetargets,
  relinkStackMetadata,
  stackBaseBranch,
  stackContext,
  stackMetadataEqual,
  stackIssues,
  stackPebblesComment,
  stackPrBodySection,
  upsertStackPrBodySection,
  type StackMetadata,
  type StackPrRecord,
  type StackRetargetAction,
} from "./stack.mts";
type PlannedWorkIssue = PlannedIssue & { stack?: StackMetadata };
type CompletedIssue = PlannedWorkIssue & { worktreePath: string };
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

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const BYTES_PER_GIB = 1024 ** 3;

type CliOptions = {
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
};

export type PicastleRunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  runPrep?: boolean;
};

export type PicastleRunResult = {
  repoRoot: string;
  runtimeDir: string;
  iterationsStarted: number;
};

let cli: CliOptions;
let runtimeEnv: NodeJS.ProcessEnv = process.env;
let abortSignal: AbortSignal | undefined;
let startCwd: string;
let repoRoot: string;
let repoName: string;
let cacheRoot: string;
let runtimeDir: string;
let logsDir: string;
let worktreesDir: string;
let stackMetadataDir: string;
let policy: PebblesPolicy;
let queuePolicy: QueuePolicy;
let BASE_BRANCH: string;
let ISSUE_STATUS: string;
let ISSUE_LABEL: string;
let PENDING_STATUS: string;
let REVIEW_STATUS: string;
let PEB_GLOBAL_ARGS: string;
let MAX_ITERATIONS: number;
let MAX_ISSUES: number;
let CONCURRENCY: number;
let VERIFY: boolean;
let PLAN_ONLY: boolean;
let REPAIR_ON_VERIFY_FAIL: boolean;
let PUSH: boolean;
let OPEN_PRS: boolean;
let STACK_PRS: boolean;
let PUBLISHER_AGENT: boolean;
let REVIEW_REPAIR_CYCLES: number;
let REVIEW_CONCURRENCY: number;
let TEST_AGENT_OUTPUT: string | undefined;
let TEST_AGENT_COMMAND: string | undefined;
let OPEN_PR_SCAN_LIMIT: number;
const OPEN_PR_JSON_FIELDS = "number,headRefName,url,isCrossRepository,headRepository,headRepositoryOwner";
const STACK_OPEN_PR_JSON_FIELDS = "number,headRefName,baseRefName,url,body,isCrossRepository,headRepository,headRepositoryOwner";
let WORKTREE_READY_COMMAND: string;
let BEFORE_PUSH_COMMAND: string;
let THINKING: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | undefined;
let CLEAN_TARGETS: boolean;
let MIN_FREE_GB: number;
let cachedRepositoryIdentity: RepositoryIdentity | undefined;
let authStorage: ReturnType<typeof AuthStorage.create>;
let modelRegistry: ReturnType<typeof ModelRegistry.create>;

export async function runPicastle(
  argv: string[] = process.argv.slice(2),
  options: PicastleRunOptions = {},
): Promise<PicastleRunResult> {
  cli = parseArgs(argv);
  runtimeEnv = { ...process.env, ...(options.env ?? {}) };
  abortSignal = options.signal;
  checkAbort();

  startCwd = cli.repo ? resolve(cli.repo) : options.cwd ? resolve(options.cwd) : process.cwd();
  if (options.runPrep) runPrep(argv);

  repoRoot = run("git rev-parse --show-toplevel", startCwd).stdout.trim();
  repoName = repoRoot.split("/").filter(Boolean).at(-1) ?? "repo";
  cacheRoot = runtimeEnv.XDG_CACHE_HOME || join(requireHome(), ".cache");
  runtimeDir = join(cacheRoot, "picastle", safeRepoId(repoRoot));
  logsDir = join(runtimeDir, "logs");
  worktreesDir = join(runtimeDir, "worktrees");
  stackMetadataDir = join(runtimeDir, "stacks");
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(worktreesDir, { recursive: true });
  mkdirSync(stackMetadataDir, { recursive: true });

  policy = loadPebblesPolicy(repoRoot);
  queuePolicy = deriveQueuePolicy(policy);

  BASE_BRANCH = env("PICASTLE_BASE_BRANCH", cli.base ?? "main");
  ISSUE_STATUS = env("PICASTLE_ISSUE_STATUS", queuePolicy.status);
  ISSUE_LABEL = env("PICASTLE_ISSUE_LABEL", "");
  PENDING_STATUS = env("PICASTLE_PENDING_STATUS", queuePolicy.pendingStatus);
  REVIEW_STATUS = env("PICASTLE_REVIEW_STATUS", queuePolicy.reviewStatus);
  PEB_GLOBAL_ARGS = buildPebGlobalArgs();
  MAX_ITERATIONS = envNonNegativeInt("PICASTLE_MAX_ITERATIONS", cli.maxIterations ?? 20);
  MAX_ISSUES = envNonNegativeInt("PICASTLE_MAX_ISSUES", cli.maxIssues ?? 0);
  CONCURRENCY = envInt("PICASTLE_CONCURRENCY", cli.concurrency ?? 3);
  VERIFY = envBool("PICASTLE_VERIFY", !cli.noVerify);
  PLAN_ONLY = envBool("PICASTLE_PLAN_ONLY", cli.planOnly);
  REPAIR_ON_VERIFY_FAIL = envBool("PICASTLE_REPAIR_ON_VERIFY_FAIL", true);
  PUSH = envBool("PICASTLE_PUSH", !cli.noPush);
  OPEN_PRS = envBool("PICASTLE_OPEN_PRS", !cli.noPr);
  STACK_PRS = envBool("PICASTLE_STACK_PRS", false);
  PUBLISHER_AGENT = envBool("PICASTLE_PUBLISHER_AGENT", true);
  REVIEW_REPAIR_CYCLES = envInt("PICASTLE_REVIEW_REPAIR_CYCLES", 10);
  REVIEW_CONCURRENCY = envInt("PICASTLE_REVIEW_CONCURRENCY", CONCURRENCY);
  TEST_AGENT_OUTPUT = runtimeEnv.PICASTLE_TEST_AGENT_OUTPUT;
  if (TEST_AGENT_OUTPUT !== undefined && !runtimeEnv.NODE_TEST_CONTEXT) {
    throw new Error("PICASTLE_TEST_AGENT_OUTPUT is only available to the node:test harness");
  }
  TEST_AGENT_COMMAND = runtimeEnv.PICASTLE_TEST_AGENT_COMMAND;
  if (TEST_AGENT_COMMAND !== undefined && !runtimeEnv.NODE_TEST_CONTEXT) {
    throw new Error("PICASTLE_TEST_AGENT_COMMAND is only available to the node:test harness");
  }
  // gh pr list defaults to 30; no-cap Picastle runs can exceed that. Use a high,
  // bounded scan, then locally filter to same-repository Picastle and legacy
  // Sandcastle PR heads before recovery/planning. This is not an unbounded "all PRs" query.
  OPEN_PR_SCAN_LIMIT = envInt("PICASTLE_OPEN_PR_SCAN_LIMIT", 1000);
  WORKTREE_READY_COMMAND = env("PICASTLE_WORKTREE_READY_COMMAND", "");
  BEFORE_PUSH_COMMAND = env("PICASTLE_BEFORE_PUSH_COMMAND", "");
  THINKING = runtimeEnv.PICASTLE_THINKING as typeof THINKING;
  CLEAN_TARGETS = envBool("PICASTLE_CLEAN_TARGETS", cli.cleanTargets ?? false);
  MIN_FREE_GB = envNonNegativeNumber("PICASTLE_MIN_FREE_GB", cli.minFreeGb ?? 0);
  cachedRepositoryIdentity = undefined;

  authStorage = AuthStorage.create();
  modelRegistry = ModelRegistry.create(authStorage);

  console.log(`Picastle repo: ${repoRoot}`);
  console.log(`Picastle runtime: ${runtimeDir}`);
  console.log(`Pebbles queue: status=${ISSUE_STATUS}${ISSUE_LABEL ? ` label=${ISSUE_LABEL}` : ""}`);
  if (MIN_FREE_GB > 0) console.log(`Disk guardrail: require ${MIN_FREE_GB} GiB free`);
  if (CLEAN_TARGETS) console.log("Disk cleanup: per-worktree target/ cleanup enabled");
  if (STACK_PRS) console.log("Stacked PR mode: enabled for multi-issue batches");
  checkMinFreeSpace("startup");

  let iterationsStarted = 0;
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    iterationsStarted = iteration;
    checkAbort();
    checkMinFreeSpace(`iteration ${iteration} start`);
    console.log(`\n=== Picastle iteration ${iteration}/${MAX_ITERATIONS} ===\n`);

    const recovery = recoverInterruptedRun({ readOnly: PLAN_ONLY });
    if (!PLAN_ONLY && recovery.interruptedImplementations.length > 0) {
      console.log("Recovery has interrupted implementation work; resuming before planning new work.");
      const settled = await resumeInterruptedImplementations(recovery.interruptedImplementations, iteration);
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

    if (!PLAN_ONLY && recovery.unpublishedBranches.length > 0) {
      console.log("Recovery has unpublished local branches; reviewing/publishing before planning new work.");
      if (PUBLISHER_AGENT) {
        await publishCompletedIssuesWithAgent(recovery.unpublishedBranches, iteration);
      } else {
        await publishCompletedIssues(recovery.unpublishedBranches, iteration);
      }
      runPendingFanIn();
      continue;
    }

    const plan = await planIssues(iteration, recovery.blockedIssueIds);
    const issues = plan.issues;
    for (const line of formatPlannerBlockedSummary(plan)) console.log(line);
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

    const plannedWork = preparePlannedIssuesForImplementation(issues);
    const settled = STACK_PRS && plannedWork.length > 1
      ? await runSequentially(plannedWork, (issue) => implementIssue(issue, iteration))
      : await runWithConcurrency(plannedWork, CONCURRENCY, (issue) => implementIssue(issue, iteration));

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
  return { repoRoot, runtimeDir, iterationsStarted };
}

function runPrep(argv: string[]): void {
  const args = argv.map(shellQuote).join(" ");
  const command = `bash ${shellQuote(join(scriptRoot, "scripts", "prep.sh"))}${args ? ` ${args}` : ""}`;
  const prep = run(command, startCwd, { allowFailure: true });
  if (prep.stdout) process.stdout.write(prep.stdout);
  if (prep.stderr) process.stderr.write(prep.stderr);
}

function checkAbort(): void {
  if (!abortSignal?.aborted) return;
  const error = new Error("Picastle run aborted");
  error.name = "AbortError";
  throw error;
}

function isDirectRun(): boolean {
  return process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}

function runPendingFanIn(): void {
  if (PLAN_ONLY) {
    console.log("PICASTLE_PLAN_ONLY=1; skipping fan-in.");
    return;
  }
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

function recoverInterruptedRun(options: { readOnly?: boolean } = {}): RecoveryPlan & { unpublishedBranches: CompletedIssue[] } {
  if (options.readOnly) {
    console.log("PICASTLE_PLAN_ONLY=1; recovery scan is read-only/log-only.");
  } else {
    const prune = run("git worktree prune --verbose", repoRoot, { allowFailure: true });
    if (prune.status !== 0) console.warn(`  ⚠ git worktree prune failed: ${prune.stderr || prune.stdout}`);
    else if (prune.stdout.trim()) console.log(`Recovery pruned stale worktree metadata:\n${prune.stdout.trim()}`);
  }

  const branchInputs = collectRecoveryBranches();
  const plan = buildRecoveryPlan(branchInputs, {
    status: ISSUE_STATUS,
    readyLabel: queuePolicy.policyReadyLabel,
    requiredLabel: ISSUE_LABEL || undefined,
  });
  logRecoveryPlan(plan);
  reconcileOpenStackPrs(options, dirtyStackBranches(branchInputs));

  if (options.readOnly) {
    return { ...plan, unpublishedBranches: [] };
  }

  const refreshedPlan = refreshRecoveryPlanStackMetadata(plan);
  const unpublishedBranches: CompletedIssue[] = [];
  for (const action of selectRecoveryActions(refreshedPlan, options)) {
    if (action.kind === "declare-pending-closure") {
      if (declarePendingPebbleClosure(action.issueId, action.prUrl)) {
        markIssueInReview(action.issueId);
      }
    } else {
      unpublishedBranches.push({
        ...action.issue,
        worktreePath: action.issue.worktreePath ?? ensureBranchWorktree(action.issue.branch),
      });
    }
  }

  return { ...refreshedPlan, unpublishedBranches };
}

function declarePendingPebbleClosure(issueId: string, prRef: string): boolean {
  if (PLAN_ONLY) {
    console.log(`PICASTLE_PLAN_ONLY=1; skipping peb closes add for ${issueId}.`);
    return false;
  }
  const closes = run(pebCommand(`closes add ${shellQuote(issueId)} --pr ${shellQuote(prRef)}`), repoRoot, {
    allowFailure: true,
  });
  if (pebClosureRegistrationSucceeded(closes)) return true;
  console.warn(`  ⚠ failed to declare pending pebble closure for ${issueId}: ${closes.stderr || closes.stdout}`);
  return false;
}

function collectRecoveryBranches(): RecoveryBranchInput[] {
  const worktrees = collectWorktreeEntries();
  const worktreeByBranch = new Map(worktrees.filter((entry) => entry.branch).map((entry) => [entry.branch!, entry]));
  const openPrByHead = loadOpenPrRecoveryRecordsByHead();
  const issueCache = new Map<string, { title?: string; status?: string; labels?: string[]; lookup: RecoveryIssueLookup } | undefined>();
  const knownIssueIds = loadKnownIssueIdsForRecovery();

  const localBranches = listLocalPicastleBranches();
  const localBranchNames = new Set(localBranches.map((branch) => branch.branch));
  const inputs: RecoveryBranchInput[] = localBranches.map((localBranch) => {
    assertSafeRecoveryBranchName(localBranch.branch);
    const openPr = openPrByHead.get(localBranch.branch);
    const openPrUrl = openPr?.url;
    const issueId = openPrUrl
      ? extractIssueIdFromOpenPrHead(localBranch.branch, knownIssueIds)
      : extractIssueIdFromBranch(localBranch.branch, knownIssueIds);
    const worktree = worktreeByBranch.get(localBranch.branch);
    const dirty = worktree?.path && existsSync(worktree.path)
      ? run("git status --porcelain", worktree.path).stdout.trim().length > 0
      : false;
    const stack = loadPersistedStackMetadata(localBranch.branch) ?? openPr?.stack;
    const ahead = countRecoverableCommits(localBranch.branch, stack);
    const unpushed = openPrUrl ? countUnpushedCommits(localBranch.branch, ahead) : 0;
    const issue = issueId ? readIssueForRecovery(issueId, issueCache) : undefined;
    return {
      branch: localBranch.branch,
      issueId,
      title: issue?.title,
      issueStatus: issue?.status,
      issueLabels: issue?.labels,
      issueLookup: issue?.lookup,
      ahead,
      unpushed,
      dirty,
      worktreePath: worktree?.path,
      openPrUrl,
      commitTime: localBranch.commitTime,
      stack,
    };
  });

  for (const [head, openPr] of openPrByHead) {
    if (!isRecognizedRecoveryPrHead(head) || localBranchNames.has(head)) continue;
    const issueId = extractIssueIdFromOpenPrHead(head, knownIssueIds);
    const issue = issueId ? readIssueForRecovery(issueId, issueCache) : undefined;
    inputs.push({
      branch: head,
      issueId,
      title: issue?.title,
      issueStatus: issue?.status,
      issueLabels: issue?.labels,
      issueLookup: issue?.lookup,
      ahead: 0,
      dirty: false,
      openPrUrl: openPr.url,
      stack: openPr.stack ?? loadPersistedStackMetadata(head),
    });
  }

  return inputs;
}

function countRecoverableCommits(branch: string, stack?: StackMetadata): number {
  assertSafeRecoveryBranchName(branch);
  const base = stack ? stackBaseBranch(stack) : BASE_BRANCH;
  const baseRef = resolveRecoveryComparisonBase(base) ?? (base === BASE_BRANCH ? undefined : resolveRecoveryComparisonBase(BASE_BRANCH));
  if (!baseRef) throw new Error(`cannot compare recovery branch ${branch}: missing base ${base}`);
  if (baseRef !== base) {
    console.warn(`  ⚠ recovery compare base ${base} missing for ${branch}; falling back to ${baseRef}`);
  }
  const aheadOutput = run(
    `git rev-list --count ${shellQuote(baseRef)}..${shellQuote(branch)}`,
    repoRoot,
  ).stdout.trim();
  const ahead = Number(aheadOutput);
  if (!Number.isFinite(ahead)) {
    throw new Error(`invalid git rev-list ahead count for ${branch} against ${baseRef}: ${aheadOutput}`);
  }
  return ahead;
}

function resolveRecoveryComparisonBase(base: string): string | undefined {
  const exists = run(`git rev-parse --verify --quiet ${shellQuote(base)}`, repoRoot, { allowFailure: true }).status === 0;
  if (exists) return base;
  if (!isRecognizedRecoveryPrHead(base)) return undefined;
  const remoteRef = `origin/${base}`;
  if (!isSafeRecoveryTrackingRef(remoteRef)) throw new Error(`unsafe Picastle recovery tracking ref for ${base}: ${remoteRef}`);
  const remoteExists = run(`git rev-parse --verify --quiet ${shellQuote(remoteRef)}`, repoRoot, { allowFailure: true }).status === 0;
  return remoteExists ? remoteRef : undefined;
}

function countUnpushedCommits(branch: string, fallbackWhenNoTracking: number): number {
  assertSafeRecoveryBranchName(branch);
  const upstream = run(
    `git rev-parse --abbrev-ref --symbolic-full-name ${shellQuote(`${branch}@{upstream}`)}`,
    repoRoot,
    { allowFailure: true },
  ).stdout.trim();
  const candidates = [upstream, `origin/${branch}`].filter(Boolean);

  for (const candidate of candidates) {
    if (!isSafeRecoveryTrackingRef(candidate)) {
      throw new Error(`unsafe Picastle recovery tracking ref for ${branch}: ${candidate}`);
    }
    const exists = run(`git rev-parse --verify --quiet ${shellQuote(candidate)}`, repoRoot, { allowFailure: true }).status === 0;
    if (!exists) continue;
    const countOutput = run(`git rev-list --count ${shellQuote(candidate)}..${shellQuote(branch)}`, repoRoot).stdout.trim();
    const count = Number(countOutput);
    if (!Number.isFinite(count)) throw new Error(`invalid unpushed count for ${branch}: ${countOutput}`);
    return count;
  }

  return Math.max(0, fallbackWhenNoTracking);
}

function isSafeRecoveryTrackingRef(ref: string): boolean {
  return /^(?:refs\/remotes\/)?[a-z0-9._-]+\/picastle\/[a-z0-9][a-z0-9._-]*$/.test(ref) && !ref.includes("..") && !ref.includes("@{") && !ref.endsWith(".lock");
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

function loadRepositoryIdentity(): RepositoryIdentity {
  if (cachedRepositoryIdentity) return cachedRepositoryIdentity;
  const result = run("gh repo view --json name,owner", repoRoot);
  const parsed = JSON.parse(result.stdout) as { name?: unknown; owner?: { login?: unknown } };
  if (typeof parsed.name !== "string" || parsed.name.length === 0 || typeof parsed.owner?.login !== "string" || parsed.owner.login.length === 0) {
    throw new Error("failed to parse gh repo identity JSON: expected name and owner.login");
  }
  cachedRepositoryIdentity = { owner: parsed.owner.login, name: parsed.name };
  return cachedRepositoryIdentity;
}

function loadOpenPrRecoveryRecordsByHead(): Map<string, { url: string; stack?: StackMetadata }> {
  const openPrs = loadOpenStackPrRecords("open GitHub recovery PR list");
  const byHead = new Map<string, { url: string; stack?: StackMetadata }>();
  for (const pr of openPrs) {
    byHead.set(pr.headRefName, {
      url: pr.url || (pr.number ? String(pr.number) : pr.headRefName),
      stack: parseStackMetadataFromBody(pr.body),
    });
  }
  return byHead;
}

function loadOpenStackPrRecords(description: string): StackPrRecord[] {
  const result = run(
    `gh pr list --state open --limit ${OPEN_PR_SCAN_LIMIT} --json ${STACK_OPEN_PR_JSON_FIELDS}`,
    repoRoot,
  );
  const knownIssueIds = loadKnownIssueIdsForRecovery();
  const normalized = normalizeOpenPrsJson(result.stdout, { currentRepository: loadRepositoryIdentity(), knownIssueIds });
  return parseJsonArray(normalized, description) as StackPrRecord[];
}

function loadExistingOpenPrForIssue(issueId: string): { headRefName: string; url: string } | undefined {
  const knownIssueIds = loadKnownIssueIdsForRecovery();
  const result = run(
    `gh pr list --state open --limit ${OPEN_PR_SCAN_LIMIT} --json ${OPEN_PR_JSON_FIELDS}`,
    repoRoot,
  );
  return findOpenPrForIssue(result.stdout, issueId, { currentRepository: loadRepositoryIdentity(), knownIssueIds });
}

function dirtyStackBranches(branches: RecoveryBranchInput[]): Set<string> {
  return new Set(branches.filter((branch) => branch.dirty && branch.stack).map((branch) => branch.branch));
}

function reconcileOpenStackPrs(options: { readOnly?: boolean } = {}, dirtyBranches = new Set<string>()): void {
  if (!OPEN_PRS) return;
  const openPrs = loadOpenStackPrRecords("open GitHub stack PR list");
  const retargets = planStackRetargets(openPrs, BASE_BRANCH);
  if (options.readOnly) {
    for (const action of retargets) logStackRetargetAction(action, true);
    return;
  }

  const actionsByHead = new Map(retargets.map((action) => [action.headRefName, action]));
  const applied = new Set<string>();
  for (const group of openStackPrGroups(openPrs)) {
    let upstreamRebased = false;
    for (const [index, entry] of group.entries()) {
      const action = actionsByHead.get(entry.pr.headRefName);
      if (action) {
        if (dirtyBranches.has(action.headRefName)) {
          logStackReconcileDeferred(action.headRefName, action.expectedBase);
          applied.add(action.headRefName);
          upstreamRebased = false;
          continue;
        }
        upstreamRebased = applyStackRetargetAction(action, { rebaseBranch: upstreamRebased }) || upstreamRebased;
        applied.add(action.headRefName);
        continue;
      }

      if (!upstreamRebased) continue;
      const refreshedStack = relinkStackMetadata(entry.stack, {
        baseBranch: BASE_BRANCH,
        headBranch: entry.pr.headRefName,
        previousBranch: group[index - 1]?.pr.headRefName,
        nextBranch: group[index + 1]?.pr.headRefName,
      });
      if (dirtyBranches.has(entry.pr.headRefName)) {
        logStackReconcileDeferred(entry.pr.headRefName, stackBaseBranch(refreshedStack));
        upstreamRebased = false;
        continue;
      }
      upstreamRebased = applyStackRetargetAction({
        prRef: entry.pr.url || (entry.pr.number ? String(entry.pr.number) : entry.pr.headRefName),
        headRefName: entry.pr.headRefName,
        currentBase: entry.pr.baseRefName,
        expectedBase: stackBaseBranch(refreshedStack),
        stack: refreshedStack,
        currentBody: entry.pr.body,
        updateBase: false,
        updateBody: true,
        effectiveBaseChanged: false,
      }, { rebaseBranch: true }) || upstreamRebased;
    }
  }

  for (const action of retargets) {
    if (applied.has(action.headRefName)) continue;
    if (dirtyBranches.has(action.headRefName)) {
      logStackReconcileDeferred(action.headRefName, action.expectedBase);
      continue;
    }
    applyStackRetargetAction(action);
  }
}

function logStackReconcileDeferred(headRefName: string, expectedBase: string): void {
  console.warn(`  stack reconcile deferred: ${headRefName} base ${expectedBase} (dirty worktree; recovery will resume it first)`);
}

function logStackRetargetAction(action: StackRetargetAction, readOnly = false): void {
  const message = action.updateBase
    ? `  stack retarget: ${action.headRefName} base ${action.currentBase} → ${action.expectedBase}`
    : `  stack metadata refresh: ${action.headRefName} base ${action.expectedBase}`;
  console.log(readOnly ? `${message} (plan-only)` : message);
}

function applyStackRetargetAction(action: StackRetargetAction, options: { rebaseBranch?: boolean } = {}): boolean {
  logStackRetargetAction(action);
  const result = action.updateBase || action.effectiveBaseChanged || options.rebaseBranch
    ? rebaseOpenStackPrBranch(action.headRefName, action.expectedBase, action.stack)
    : { worktreePath: ensureExistingBranchWorktree(action.headRefName), rebased: false };
  persistStackMetadata(action.stack);
  const bodyFile = writeStackPrBodyRefreshFile(action);
  const baseEdit = action.updateBase ? ` --base ${shellQuote(action.expectedBase)}` : "";
  run(`gh pr edit ${shellQuote(action.prRef)}${baseEdit} --body-file ${shellQuote(bodyFile)}`, repoRoot);
  const comment = stackPebblesComment(action.stack, action.prRef);
  if (comment) postPebblesComment(result.worktreePath, action.stack.issueId, comment);
  return result.rebased;
}

function openStackPrGroups(openPrs: StackPrRecord[]): Array<Array<{ pr: StackPrRecord; stack: StackMetadata }>> {
  const byStackId = new Map<string, Array<{ pr: StackPrRecord; stack: StackMetadata }>>();
  for (const pr of openPrs) {
    const stack = parseStackMetadataFromBody(pr.body);
    if (!stack) continue;
    const group = byStackId.get(stack.stackId) ?? [];
    group.push({ pr, stack });
    byStackId.set(stack.stackId, group);
  }
  return [...byStackId.values()].map((group) =>
    group.sort((a, b) => a.stack.index - b.stack.index || a.pr.headRefName.localeCompare(b.pr.headRefName)),
  );
}

function persistStackMetadata(stack: StackMetadata): void {
  const refreshedStack = refreshStackHeadSha(stack);
  assertSafeRecoveryBranchName(refreshedStack.headBranch);
  mkdirSync(stackMetadataDir, { recursive: true });
  writeFileSync(stackMetadataPath(refreshedStack.headBranch), JSON.stringify(refreshedStack, null, 2));
}

function refreshStackHeadSha(stack: StackMetadata): StackMetadata {
  const refreshed = { ...stack };
  if (!refreshed.previousBranch) {
    delete refreshed.previousHeadSha;
    return refreshed;
  }
  const previousHeadSha = resolveCommitSha(refreshed.previousBranch);
  if (previousHeadSha) refreshed.previousHeadSha = previousHeadSha;
  return refreshed;
}

function resolveCommitSha(ref: string): string | undefined {
  if (ref !== BASE_BRANCH && !isRecognizedRecoveryPrHead(ref)) return undefined;
  const result = run(`git rev-parse --verify --quiet ${shellQuote(`${ref}^{commit}`)}`, repoRoot, { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() || undefined : undefined;
}

function loadPersistedStackMetadata(branch: string): StackMetadata | undefined {
  if (!branch.startsWith("picastle/")) return undefined;
  assertSafeRecoveryBranchName(branch);
  const path = stackMetadataPath(branch);
  if (!existsSync(path)) return undefined;
  try {
    const stack = parseStackMetadataJson(JSON.parse(readFileSync(path, "utf8")));
    if (!stack || stack.headBranch !== branch) {
      console.warn(`  ⚠ ignoring invalid Picastle stack metadata for ${branch}`);
      return undefined;
    }
    return stack;
  } catch (error) {
    console.warn(`  ⚠ failed to read Picastle stack metadata for ${branch}: ${formatError(error)}`);
    return undefined;
  }
}

function stackMetadataPath(branch: string): string {
  return join(stackMetadataDir, `${hashString(branch)}.json`);
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
  cache: Map<string, { title?: string; status?: string; labels?: string[]; lookup: RecoveryIssueLookup } | undefined>,
): { title?: string; status?: string; labels?: string[]; lookup: RecoveryIssueLookup } | undefined {
  if (cache.has(issueId)) return cache.get(issueId);
  const show = run(pebCommand(`show ${shellQuote(issueId)} --json`), repoRoot, { allowFailure: true });
  if (show.status !== 0) {
    const lookup = classifyPebShowFailure(show.stderr || show.stdout);
    const result = { lookup };
    cache.set(issueId, result);
    return result;
  }
  try {
    const issue = JSON.parse(show.stdout).data as { title?: string; status?: string; labels?: unknown };
    const result = { ...issue, labels: normalizeIssueLabels(issue.labels), lookup: { state: "found" } as const };
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

function normalizeIssueLabels(labels: unknown): string[] {
  if (!Array.isArray(labels)) return [];
  const names = new Set<string>();
  for (const label of labels) {
    if (typeof label === "string" && label.length > 0) {
      names.add(label);
    } else if (label && typeof label === "object") {
      const name = (label as { name?: unknown }).name;
      if (typeof name === "string" && name.length > 0) names.add(name);
    }
  }
  return [...names];
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

async function planIssues(iteration: number, suppressedIssueIds: Set<string>): Promise<PlannerDecision> {
  const allKnownIssueIds = loadKnownIssueIdsForRecovery();
  const openPrsStdout = run(
    `gh pr list --state open --limit ${OPEN_PR_SCAN_LIMIT} --json ${OPEN_PR_JSON_FIELDS}`,
    repoRoot,
  ).stdout;
  const currentRepository = loadRepositoryIdentity();
  const candidates = filterCandidateIssuesWithoutOpenPrs(loadCandidateIssues(suppressedIssueIds), openPrsStdout, {
    currentRepository,
    knownIssueIds: allKnownIssueIds,
  });

  const openPrsJson = normalizeOpenPrsJson(openPrsStdout, {
    currentRepository,
    knownIssueIds: allKnownIssueIds,
  });
  const openPrs = parseJsonArray(openPrsJson, "open GitHub PR list");
  // Fail closed before giving malformed context to the planner or writing an audit
  // artifact that would imply the context was trustworthy.
  parsePlannerContext({ candidates, openPrs });
  const issuesJson = JSON.stringify(candidates);

  const prompt = renderPrompt("plan-prompt.md", {
    ISSUES_JSON: issuesJson,
    OPEN_PRS_JSON: JSON.stringify(openPrs),
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

  let plan: PlannerDecision;
  try {
    plan = parsePlannerPlan(stdout, { candidates, openPrs, maxIssues: MAX_ISSUES });
    plan = {
      ...plan,
      issues: validatePlannedIssueSelections(plan.issues, candidates, {
        suppressedIssueIds,
        normalizeBranch: (branch, id) => normalizeBranch(branch, id),
      }),
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Planner did not produce a <plan> block") {
      throw new Error(`Planner did not produce a <plan> block. See ${join(logsDir, `picastle-planner-${iteration}.log`)}`);
    }
    throw error;
  }

  writeFileSync(
    join(logsDir, `picastle-planner-${iteration}-audit.json`),
    JSON.stringify({ iteration, generatedAt: new Date().toISOString(), candidates, openPrs, ...plan }, null, 2) + "\n",
  );
  return plan;
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
    throw new Error(`Pebbles issue query failed: ${result.stderr || result.stdout}`);
  }
  return parseJsonArray(result.stdout, "Pebbles issue query result");
}

function parseJsonArray(input: string, description: string): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw new Error(`Failed to parse ${description}: ${formatError(error)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${description} must be a JSON array`);
  }
  return parsed;
}

async function resumeInterruptedImplementations(
  issues: RecoveryIssue[],
  iteration: number,
): Promise<PromiseSettledResult<CompletedIssue | undefined>[]> {
  if (!issues.some((issue) => issue.stack)) {
    return runWithConcurrency(issues, CONCURRENCY, (issue) => implementIssue(issue, iteration));
  }

  const ordered = orderInterruptedStackRecoveryIssues(issues);
  console.log("Recovery contains stacked implementation work; resuming sequentially in stack order.");
  const completedByStack = new Map<string, CompletedIssue[]>();
  return runSequentially(ordered, async (issue) => {
    const completed = await implementIssue(issue, iteration);
    if (completed?.stack) {
      const stackCompleted = [...(completedByStack.get(completed.stack.stackId) ?? []), completed]
        .sort((a, b) => a.stack!.index - b.stack!.index || a.id.localeCompare(b.id));
      completedByStack.set(completed.stack.stackId, stackCompleted);
      rebaseStackOntoExpectedBases(stackCompleted);
    }
    return completed;
  });
}

function orderInterruptedStackRecoveryIssues(issues: RecoveryIssue[]): RecoveryIssue[] {
  return issues
    .map((issue, position) => ({ issue, position }))
    .sort((a, b) => {
      const aStack = a.issue.stack;
      const bStack = b.issue.stack;
      if (aStack && bStack) {
        if (aStack.stackId !== bStack.stackId) return aStack.stackId.localeCompare(bStack.stackId) || a.position - b.position;
        return aStack.index - bStack.index || a.issue.id.localeCompare(b.issue.id) || a.position - b.position;
      }
      if (aStack || bStack) return aStack ? -1 : 1;
      return a.position - b.position;
    })
    .map((entry) => entry.issue);
}

async function implementIssue(
  issue: PlannedWorkIssue,
  iteration: number,
): Promise<CompletedIssue | undefined> {
  assertMutableMode("run implementer");
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
      BASE_BRANCH: effectiveBaseBranch(issue),
      STACK_CONTEXT: stackContext(issue.stack),
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

    const ahead = Number(run(`git rev-list --count ${shellQuote(effectiveBaseBranch(issue))}..HEAD`, worktreePath).stdout.trim() || "0");
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
  assertMutableMode("review/publish completed issues");
  console.log(
    `\n==> Review/repair loop handling ${completed.length} completed branch(es) with concurrency ${REVIEW_CONCURRENCY}`,
  );

  const publishTargets = prepareCompletedIssuesForPublishing(completed);
  const settled = STACK_PRS && publishTargets.length > 1
    ? await reviewAndPublishStackWithAgent(publishTargets, iteration)
    : await runWithConcurrency(publishTargets, REVIEW_CONCURRENCY, async (issue) => {
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

async function reviewAndPublishStackWithAgent(
  stack: CompletedIssue[],
  iteration: number,
): Promise<PromiseSettledResult<{ issue: CompletedIssue; published: boolean }>[]> {
  const results: PromiseSettledResult<{ issue: CompletedIssue; published: boolean }>[] = [];
  const approved: CompletedIssue[] = [];
  try {
    for (const issue of stack) {
      const isApproved = await reviewIssueUntilApproved(issue, iteration);
      if (!isApproved) {
        results.push({ status: "fulfilled", value: { issue, published: false } });
        break;
      }
      approved.push(issue);
      rebaseDownstreamStackEntries(stack, issue);
      results.push({ status: "fulfilled", value: { issue, published: false } });
    }

    if (approved.length !== stack.length) return results;
    rebaseStackOntoExpectedBases(stack);
    verifyStackMergeability(stack);
    for (const issue of stack) await publishApprovedIssue(issue);
    return stack.map((issue) => ({ status: "fulfilled", value: { issue, published: true } }));
  } catch (reason) {
    results.push({ status: "rejected", reason });
    return results;
  } finally {
    for (const issue of stack) cleanWorktreeTarget(issue.worktreePath, issue.id);
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
    BASE_BRANCH: effectiveBaseBranch(issue),
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
    ...createReviewerAgentTooling(issue.worktreePath),
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
    BASE_BRANCH: effectiveBaseBranch(issue),
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
  assertMutableMode("publish approved issue");
  console.log(`\n==> Publishing approved branch ${issue.id} (${issue.branch})`);

  const existingPr = loadExistingOpenPrForIssue(issue.id);
  const publishDecision = decidePublishFlow(issue.branch, existingPr, { openPrs: OPEN_PRS });
  const commandDecision = decidePublishCommandBoundary(publishDecision, { push: PUSH });
  if (publishDecision.kind === "use-existing-issue-pr") {
    console.log(`  issue already has open PR on ${publishDecision.existingPr.headRefName}: ${publishDecision.existingPr.url}`);
    recordPublishedStackPosition(issue, publishDecision.existingPr.url);
    if (declarePendingPebbleClosure(issue.id, publishDecision.existingPr.url)) {
      markIssueInReview(issue.id);
    }
    return;
  }

  rebaseIssueStackBranchIfNeeded(issue);

  if (commandDecision.shouldPush) {
    runWorktreeReadyHook(issue.worktreePath);
    if (BEFORE_PUSH_COMMAND) {
      console.log(`  before-push: ${BEFORE_PUSH_COMMAND}`);
      run(BEFORE_PUSH_COMMAND, issue.worktreePath, { stdio: "inherit" });
    }
    pushIssueBranch(issue, publishDecision.kind === "update-existing-branch-pr");
  } else {
    console.log("PICASTLE_PUSH=0; skipping git push");
  }

  if (publishDecision.kind === "update-existing-branch-pr") {
    retargetStackPrIfNeeded(issue, publishDecision.existingPr.url);
    console.log(`  updated existing PR on ${publishDecision.existingPr.headRefName}: ${publishDecision.existingPr.url}`);
    recordPublishedStackPosition(issue, publishDecision.existingPr.url);
    rebasePublishedStackDownstreamOpenPrs(issue);
    if (declarePendingPebbleClosure(issue.id, publishDecision.existingPr.url)) {
      markIssueInReview(issue.id);
    }
    return;
  }

  if (!commandDecision.shouldCreatePr && publishDecision.kind === "skip-pr-creation") {
    console.log("PICASTLE_OPEN_PRS=0; skipping PR creation");
    return;
  }

  const bodyFile = writePrBodyFile(issue);
  const prCreate = run(
    `gh pr create --base ${shellQuote(effectiveBaseBranch(issue))} --head ${shellQuote(issue.branch)} --title ${shellQuote(prTitle(issue))} --body-file ${shellQuote(bodyFile)}`,
    issue.worktreePath,
  );
  process.stdout.write(prCreate.stdout);
  process.stderr.write(prCreate.stderr);
  const prRef = extractPrRef(prCreate.stdout) || extractPrRef(prCreate.stderr);
  if (!prRef) {
    console.warn(`  ⚠ could not detect PR URL/number for ${issue.id}; skipping peb closes add`);
    return;
  }

  recordPublishedStackPosition(issue, prRef);
  rebasePublishedStackDownstreamOpenPrs(issue);
  if (declarePendingPebbleClosure(issue.id, prRef)) {
    markIssueInReview(issue.id);
  }
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
  assertMutableMode("publish completed issues");
  const publishTargets = prepareCompletedIssuesForPublishing(completed);
  if (STACK_PRS && publishTargets.length > 1) {
    rebaseStackOntoExpectedBases(publishTargets);
    verifyStackMergeability(publishTargets);
  }
  for (const issue of publishTargets) {
    try {
      console.log(`\n==> Publishing ${issue.id} (${issue.branch})`);

      const existingPr = loadExistingOpenPrForIssue(issue.id);
      const publishDecision = decidePublishFlow(issue.branch, existingPr, { openPrs: OPEN_PRS });
      if (publishDecision.kind === "use-existing-issue-pr") {
        console.log(`  issue already has open PR on ${publishDecision.existingPr.headRefName}: ${publishDecision.existingPr.url}`);
        recordPublishedStackPosition(issue, publishDecision.existingPr.url);
        if (declarePendingPebbleClosure(issue.id, publishDecision.existingPr.url)) {
          markIssueInReview(issue.id);
        }
        continue;
      }

      rebaseIssueStackBranchIfNeeded(issue);

      if (VERIFY) {
      let verified = verifyWorktree(issue.worktreePath, effectiveBaseBranch(issue));
      if (!verified.ok && REPAIR_ON_VERIFY_FAIL) {
        console.warn("  verification failed; asking Pi to repair once");
        await repairVerificationFailure(issue, verified.output, iteration);
        verified = verifyWorktree(issue.worktreePath, effectiveBaseBranch(issue));
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
      pushIssueBranch(issue, publishDecision.kind === "update-existing-branch-pr");
    } else {
      console.log("PICASTLE_PUSH=0; skipping git push");
    }

    if (publishDecision.kind === "update-existing-branch-pr") {
      retargetStackPrIfNeeded(issue, publishDecision.existingPr.url);
      console.log(`  updated existing PR on ${publishDecision.existingPr.headRefName}: ${publishDecision.existingPr.url}`);
      recordPublishedStackPosition(issue, publishDecision.existingPr.url);
      rebasePublishedStackDownstreamOpenPrs(issue);
      if (declarePendingPebbleClosure(issue.id, publishDecision.existingPr.url)) {
        markIssueInReview(issue.id);
      }
    } else if (publishDecision.kind === "create-new-pr") {
      const bodyFile = writePrBodyFile(issue);
      const prCreate = run(
        `gh pr create --base ${shellQuote(effectiveBaseBranch(issue))} --head ${shellQuote(issue.branch)} --title ${shellQuote(prTitle(issue))} --body-file ${shellQuote(bodyFile)}`,
        issue.worktreePath,
      );
      process.stdout.write(prCreate.stdout);
      process.stderr.write(prCreate.stderr);
      const prRef = extractPrRef(prCreate.stdout) || extractPrRef(prCreate.stderr);
      if (prRef) {
        recordPublishedStackPosition(issue, prRef);
        rebasePublishedStackDownstreamOpenPrs(issue);
        if (declarePendingPebbleClosure(issue.id, prRef)) {
          markIssueInReview(issue.id);
        }
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
  if (PLAN_ONLY) {
    console.log(`PICASTLE_PLAN_ONLY=1; skipping mark ${issueId} ${REVIEW_STATUS}.`);
    return;
  }
  if (!REVIEW_STATUS) return;
  const result = run(pebCommand(`update ${shellQuote(issueId)} --status ${shellQuote(REVIEW_STATUS)}`), repoRoot, {
    allowFailure: true,
  });
  if (result.status !== 0) {
    console.warn(`  ⚠ failed to mark ${issueId} ${REVIEW_STATUS}: ${result.stderr || result.stdout}`);
  }
}

function verifyWorktree(worktreePath: string, baseBranch = BASE_BRANCH): { ok: boolean; output: string } {
  checkMinFreeSpace("before verification");
  const changed = run(`git diff --name-only ${shellQuote(baseBranch)}...HEAD`, worktreePath).stdout
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
  customTools?: ToolDefinition[];
  disableExtensions?: boolean;
  prompt: string;
  logFile: string;
}): Promise<string> {
  checkMinFreeSpace(`${args.name} before agent`);
  mkdirSync(dirname(args.logFile), { recursive: true });
  writeFileSync(args.logFile, `# ${args.name}\n# cwd: ${args.cwd}\n\n`);

  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(args.cwd, agentDir);
  const resourceLoader = args.disableExtensions
    ? createReviewerResourceLoader({ cwd: args.cwd, agentDir, settingsManager })
    : undefined;
  if (resourceLoader) await resourceLoader.reload();

  if (TEST_AGENT_COMMAND !== undefined) {
    run(TEST_AGENT_COMMAND, args.cwd, {
      stdio: "inherit",
      env: {
        PICASTLE_AGENT_NAME: args.name,
        PICASTLE_AGENT_LOG_FILE: args.logFile,
      },
    });
    const output = TEST_AGENT_OUTPUT ?? "";
    if (output) {
      append(args.logFile, output + "\n");
      process.stdout.write(output + "\n");
    }
    return output;
  }

  if (TEST_AGENT_OUTPUT !== undefined) {
    append(args.logFile, TEST_AGENT_OUTPUT + "\n");
    process.stdout.write(TEST_AGENT_OUTPUT + "\n");
    return TEST_AGENT_OUTPUT;
  }


  const { session } = await createAgentSession({
    cwd: args.cwd,
    agentDir,
    tools: args.tools,
    customTools: args.customTools,
    authStorage,
    modelRegistry,
    settingsManager,
    resourceLoader,
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

  const abortListener = () => session.dispose();
  abortSignal?.addEventListener("abort", abortListener, { once: true });

  try {
    checkAbort();
    await session.prompt(args.prompt);
    process.stdout.write("\n");
    return assistantText;
  } finally {
    abortSignal?.removeEventListener("abort", abortListener);
    unsubscribe();
    session.dispose();
  }
}

function ensureIssueWorktree(issue: PlannedWorkIssue): string {
  const branch = normalizeBranch(issue.branch, issue.id);
  const worktreePath = ensureBranchWorktree(branch, effectiveBaseBranch(issue));
  if (issue.stack) persistStackMetadata({ ...issue.stack, headBranch: branch });
  return worktreePath;
}

function ensureBranchWorktree(branch: string, startPoint = BASE_BRANCH): string {
  assertMutableMode("create or attach worktree");
  assertSafeRecoveryBranchName(branch);
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
      `git worktree add -b ${shellQuote(branch)} ${shellQuote(worktreePath)} ${shellQuote(startPoint)}`,
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

function assertMutableMode(action: string): void {
  if (PLAN_ONLY) throw new Error(`PICASTLE_PLAN_ONLY=1; refusing to ${action}`);
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

function prTitle(issue: PlannedIssue): string {
  return issue.title.length <= 70 ? issue.title : `${issue.title.slice(0, 67)}...`;
}

function writePrBodyFile(issue: CompletedIssue): string {
  const bodyFile = join(logsDir, `pr-body-${issue.id}.md`);
  mkdirSync(dirname(bodyFile), { recursive: true });
  writeFileSync(bodyFile, buildPrBody(issue));
  return bodyFile;
}

function writeStackPrBodyRefreshFile(action: StackRetargetAction): string {
  const bodyFile = join(logsDir, `pr-body-stack-refresh-${hashString(action.headRefName)}.md`);
  mkdirSync(dirname(bodyFile), { recursive: true });
  writeFileSync(bodyFile, upsertStackPrBodySection(action.currentBody, refreshStackHeadSha(action.stack)));
  return bodyFile;
}

function retargetStackPrIfNeeded(issue: CompletedIssue, prRef: string): void {
  if (!issue.stack) return;
  const bodyFile = writePrBodyFile(issue);
  run(
    `gh pr edit ${shellQuote(prRef)} --base ${shellQuote(effectiveBaseBranch(issue))} --body-file ${shellQuote(bodyFile)}`,
    issue.worktreePath,
  );
}

function recordPublishedStackPosition(issue: CompletedIssue, prRef: string): void {
  const comment = stackPebblesComment(issue.stack, prRef);
  if (comment) postPebblesComment(issue.worktreePath, issue.id, comment);
}

function postPebblesComment(worktreePath: string, issueId: string, body: string): void {
  const result = run(pebCommand(`comment add ${shellQuote(issueId)} ${shellQuote(body)}`), repoRoot, {
    allowFailure: true,
  });
  if (result.status === 0) return;

  console.warn(`  ⚠ failed to post Pebbles comment for ${issueId}: ${result.stderr || result.stdout}`);
  writePendingComment(worktreePath, issueId, body);
}

function buildPrBody(issue: CompletedIssue): string {
  const stackSection = stackPrBodySection(issue.stack ? refreshStackHeadSha(issue.stack) : undefined);
  return `> *This PR was produced by an autonomous Picastle run from the agent brief on pebbles issue ${issue.id}.*

${stackSection}## Summary

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

function preparePlannedIssuesForImplementation(issues: PlannedIssue[]): PlannedWorkIssue[] {
  return STACK_PRS && issues.length > 1 ? stackIssues(issues, BASE_BRANCH) : issues;
}

function prepareCompletedIssuesForPublishing(completed: CompletedIssue[]): CompletedIssue[] {
  const ordered = STACK_PRS && completed.length > 1
    ? preservedCompletedStack(completed) ?? stackIssues(completed, BASE_BRANCH).map((issue, index) => ({ ...issue, worktreePath: completed[index]!.worktreePath }))
    : completed;
  return refreshCompletedStackMetadata(ordered);
}

function refreshCompletedStackMetadata(completed: CompletedIssue[]): CompletedIssue[] {
  return refreshIssueStackMetadata(completed, "open GitHub stack PR list for recovery publishing");
}

function refreshRecoveryPlanStackMetadata(plan: RecoveryPlan): RecoveryPlan {
  return {
    ...plan,
    interruptedImplementations: refreshIssueStackMetadata(plan.interruptedImplementations, "open GitHub stack PR list for interrupted recovery"),
    unpublishedBranches: refreshIssueStackMetadata(plan.unpublishedBranches, "open GitHub stack PR list for unpublished recovery"),
  };
}

function refreshIssueStackMetadata<T extends { branch: string; stack?: StackMetadata }>(issues: T[], openPrDescription: string): T[] {
  if (!issues.some((issue) => issue.stack)) return issues;
  const openPrs = OPEN_PRS ? loadOpenStackPrRecords(openPrDescription) : [];
  const issueByBranch = new Map(issues.filter((issue) => issue.stack).map((issue) => [issue.branch, issue]));
  const entries: Array<{ branch: string; stack: StackMetadata; issue?: T }> = [];

  for (const pr of openPrs) {
    if (issueByBranch.has(pr.headRefName)) continue;
    const stack = parseStackMetadataFromBody(pr.body);
    if (stack) entries.push({ branch: pr.headRefName, stack });
  }
  for (const issue of issues) {
    if (issue.stack) entries.push({ branch: issue.branch, stack: issue.stack, issue });
  }

  const byStackId = new Map<string, Array<{ branch: string; stack: StackMetadata; issue?: T }>>();
  for (const entry of entries) {
    const group = byStackId.get(entry.stack.stackId) ?? [];
    group.push(entry);
    byStackId.set(entry.stack.stackId, group);
  }

  const refreshedByBranch = new Map<string, StackMetadata>();
  for (const group of byStackId.values()) {
    group.sort((a, b) => a.stack.index - b.stack.index || a.branch.localeCompare(b.branch));
    for (const [index, entry] of group.entries()) {
      if (!entry.issue) continue;
      const refreshed = relinkStackMetadata(entry.stack, {
        baseBranch: BASE_BRANCH,
        headBranch: entry.branch,
        previousBranch: group[index - 1]?.branch,
        nextBranch: group[index + 1]?.branch,
      });
      refreshedByBranch.set(entry.branch, refreshed);
      if (!stackMetadataEqual(entry.stack, refreshed)) {
        console.log(`  stack metadata refresh: ${entry.branch} base ${stackBaseBranch(refreshed)}`);
        persistStackMetadata(refreshed);
      }
    }
  }

  return issues.map((issue) => {
    const stack = refreshedByBranch.get(issue.branch);
    return stack ? { ...issue, stack } : issue;
  });
}

function preservedCompletedStack(completed: CompletedIssue[]): CompletedIssue[] | undefined {
  if (!completed.every((issue) => issue.stack)) return undefined;
  const stackId = completed[0]!.stack!.stackId;
  const total = completed[0]!.stack!.total;
  if (total < completed.length) return undefined;
  if (!completed.every((issue) => issue.stack!.stackId === stackId && issue.stack!.total === total)) return undefined;
  return [...completed].sort((a, b) => a.stack!.index - b.stack!.index || a.id.localeCompare(b.id));
}

function effectiveBaseBranch(issue: PlannedWorkIssue): string {
  return issue.stack ? stackBaseBranch(issue.stack) : BASE_BRANCH;
}

function pushIssueBranch(issue: CompletedIssue, forceWithLease: boolean): void {
  const forceFlag = forceWithLease ? " --force-with-lease" : "";
  run(`git push -u origin ${shellQuote(issue.branch)}${forceFlag}`, issue.worktreePath, {
    stdio: "inherit",
  });
}

function rebaseDownstreamStackEntries(stack: CompletedIssue[], upstream: CompletedIssue): void {
  const index = stack.findIndex((issue) => issue.branch === upstream.branch);
  if (index < 0 || index >= stack.length - 1) return;
  rebaseStackOntoExpectedBases(stack.slice(index + 1));
}

function rebaseStackOntoExpectedBases(stack: CompletedIssue[]): void {
  for (const issue of stack) {
    rebaseIssueStackBranchIfNeeded(issue);
  }
}

function rebaseIssueStackBranchIfNeeded(issue: CompletedIssue): void {
  if (!issue.stack) return;
  rebaseBranchWorktree(issue.worktreePath, issue.branch, effectiveBaseBranch(issue), {
    oldUpstream: issue.stack.previousHeadSha,
  });
  persistStackMetadata(issue.stack);
}

function rebasePublishedStackDownstreamOpenPrs(issue: CompletedIssue): void {
  if (!issue.stack || !OPEN_PRS) return;
  const openPrs = loadOpenStackPrRecords("open GitHub stack PR list for downstream stack rebase");
  const entries = openPrs
    .map((pr) => ({ pr, stack: parseStackMetadataFromBody(pr.body) }))
    .filter((entry): entry is { pr: StackPrRecord; stack: StackMetadata } => entry.stack?.stackId === issue.stack!.stackId);

  const publishedIndex = entries.findIndex((entry) => entry.pr.headRefName === issue.branch);
  if (publishedIndex >= 0) {
    entries[publishedIndex] = { ...entries[publishedIndex]!, stack: issue.stack };
  } else {
    entries.push({ pr: { headRefName: issue.branch }, stack: issue.stack });
  }

  entries.sort((a, b) => a.stack.index - b.stack.index || a.pr.headRefName.localeCompare(b.pr.headRefName));
  const start = entries.findIndex((entry) => entry.pr.headRefName === issue.branch);
  if (start < 0 || start >= entries.length - 1) return;

  for (let index = start + 1; index < entries.length; index += 1) {
    const entry = entries[index]!;
    const refreshedStack = relinkStackMetadata(entry.stack, {
      baseBranch: issue.stack.baseBranch,
      headBranch: entry.pr.headRefName,
      previousBranch: entries[index - 1]?.pr.headRefName,
      nextBranch: entries[index + 1]?.pr.headRefName,
    });
    const expectedBase = stackBaseBranch(refreshedStack);
    if (isDirtyExistingStackWorktree(entry.pr.headRefName)) {
      logStackReconcileDeferred(entry.pr.headRefName, expectedBase);
      break;
    }
    applyStackRetargetAction({
      prRef: entry.pr.url || (entry.pr.number ? String(entry.pr.number) : entry.pr.headRefName),
      headRefName: entry.pr.headRefName,
      currentBase: entry.pr.baseRefName,
      expectedBase,
      stack: refreshedStack,
      currentBody: entry.pr.body,
      updateBase: Boolean(entry.pr.baseRefName && entry.pr.baseRefName !== expectedBase),
      updateBody: !stackMetadataEqual(entry.stack, refreshedStack),
      effectiveBaseChanged: stackBaseBranch(entry.stack) !== expectedBase,
    }, { rebaseBranch: true });
  }
}

function isDirtyExistingStackWorktree(branch: string): boolean {
  const worktree = collectWorktreeEntries().find((entry) => entry.branch === branch && existsSync(entry.path));
  return Boolean(worktree && run("git status --porcelain", worktree.path).stdout.trim());
}

function rebaseOpenStackPrBranch(branch: string, expectedBase: string, stack?: StackMetadata): { worktreePath: string; rebased: boolean } {
  const worktreePath = ensureExistingBranchWorktree(branch);
  const rebased = rebaseBranchWorktree(worktreePath, branch, expectedBase, {
    oldUpstream: stack?.previousHeadSha,
  });
  if (!rebased) return { worktreePath, rebased: false };
  if (!PUSH) {
    console.log("PICASTLE_PUSH=0; skipping force-with-lease update after stack rebase");
    return { worktreePath, rebased: true };
  }
  run(`git push -u origin ${shellQuote(branch)} --force-with-lease`, worktreePath, { stdio: "inherit" });
  return { worktreePath, rebased: true };
}

function ensureExistingBranchWorktree(branch: string): string {
  assertSafeRecoveryBranchName(branch);
  const branchExists = run(`git rev-parse --verify ${shellQuote(branch)}`, repoRoot, { allowFailure: true }).status === 0;
  if (!branchExists) {
    const remoteRef = `origin/${branch}`;
    if (!isSafeRecoveryTrackingRef(remoteRef)) {
      throw new Error(`unsafe Picastle recovery tracking ref for ${branch}: ${remoteRef}`);
    }
    const remoteExists = run(`git rev-parse --verify --quiet ${shellQuote(remoteRef)}`, repoRoot, { allowFailure: true }).status === 0;
    if (!remoteExists) throw new Error(`cannot rebase stack branch ${branch}: no local branch or ${remoteRef}`);
    run(`git branch --track ${shellQuote(branch)} ${shellQuote(remoteRef)}`, repoRoot);
  }
  return ensureBranchWorktree(branch);
}

function rebaseBranchWorktree(
  worktreePath: string,
  branch: string,
  base: string,
  options: { oldUpstream?: string } = {},
): boolean {
  assertSafeRecoveryBranchName(branch);
  const rebaseBase = resolveFreshRebaseBase(base);
  const ancestor = run(`git merge-base --is-ancestor ${shellQuote(rebaseBase)} ${shellQuote(branch)}`, repoRoot, {
    allowFailure: true,
  });
  if (ancestor.status === 0) return false;

  const dirty = run("git status --porcelain", worktreePath).stdout.trim();
  if (dirty) throw new Error(`refusing to rebase dirty stack worktree ${branch}`);

  const oldUpstream = resolveSafeRebaseBoundary(options.oldUpstream, branch);
  console.log(`  rebasing stack branch ${branch} onto ${base}`);
  const command = oldUpstream
    ? `git rebase --onto ${shellQuote(rebaseBase)} ${shellQuote(oldUpstream)} ${shellQuote(branch)}`
    : `git rebase ${shellQuote(rebaseBase)}`;
  const rebase = run(command, worktreePath, { allowFailure: true });
  if (rebase.status !== 0) {
    run("git rebase --abort", worktreePath, { allowFailure: true });
    throw new Error(`failed to rebase stack branch ${branch} onto ${base}: ${rebase.stderr || rebase.stdout}`);
  }
  return true;
}

function resolveSafeRebaseBoundary(oldUpstream: string | undefined, branch: string): string | undefined {
  if (!oldUpstream) return undefined;
  if (!/^[0-9a-f]{7,40}$/i.test(oldUpstream)) return undefined;
  const exists = run(`git rev-parse --verify --quiet ${shellQuote(`${oldUpstream}^{commit}`)}`, repoRoot, {
    allowFailure: true,
  }).status === 0;
  if (!exists) return undefined;
  const ancestor = run(`git merge-base --is-ancestor ${shellQuote(oldUpstream)} ${shellQuote(branch)}`, repoRoot, {
    allowFailure: true,
  });
  return ancestor.status === 0 ? oldUpstream : undefined;
}

function resolveFreshRebaseBase(base: string): string {
  if (base === BASE_BRANCH) {
    const remoteBase = refreshRepositoryBaseFromOrigin(base);
    if (remoteBase) return remoteBase;
  }
  const exists = run(`git rev-parse --verify --quiet ${shellQuote(base)}`, repoRoot, { allowFailure: true }).status === 0;
  if (exists) return base;
  if (!isRecognizedRecoveryPrHead(base)) throw new Error(`cannot rebase stack branch: missing local base ${base}`);
  const remoteRef = `origin/${base}`;
  if (!isSafeRecoveryTrackingRef(remoteRef)) throw new Error(`unsafe Picastle recovery tracking ref for ${base}: ${remoteRef}`);
  const remoteExists = run(`git rev-parse --verify --quiet ${shellQuote(remoteRef)}`, repoRoot, { allowFailure: true }).status === 0;
  if (!remoteExists) throw new Error(`cannot rebase stack branch: missing local base ${base} and ${remoteRef}`);
  run(`git branch --track ${shellQuote(base)} ${shellQuote(remoteRef)}`, repoRoot);
  return base;
}

function refreshRepositoryBaseFromOrigin(base: string): string | undefined {
  const hasOrigin = run("git remote get-url origin", repoRoot, { allowFailure: true }).status === 0;
  if (!hasOrigin) return undefined;
  const validBranch = run(`git check-ref-format --branch ${shellQuote(base)}`, repoRoot, { allowFailure: true }).status === 0;
  if (!validBranch) throw new Error(`cannot refresh invalid repository base branch ${base}`);
  const remoteRef = `refs/remotes/origin/${base}`;
  const fetch = run(`git fetch --quiet origin ${shellQuote(`${base}:${remoteRef}`)}`, repoRoot, { allowFailure: true });
  if (fetch.status !== 0) throw new Error(`failed to refresh repository base ${base} from origin: ${fetch.stderr || fetch.stdout}`);
  const remoteExists = run(`git rev-parse --verify --quiet ${shellQuote(`${remoteRef}^{commit}`)}`, repoRoot, { allowFailure: true }).status === 0;
  if (!remoteExists) return undefined;
  const localExists = run(`git rev-parse --verify --quiet ${shellQuote(`${base}^{commit}`)}`, repoRoot, { allowFailure: true }).status === 0;
  if (!localExists) return remoteRef;
  const localIsStale = run(`git merge-base --is-ancestor ${shellQuote(base)} ${shellQuote(remoteRef)}`, repoRoot, { allowFailure: true }).status === 0;
  if (localIsStale) return remoteRef;
  const remoteIsStale = run(`git merge-base --is-ancestor ${shellQuote(remoteRef)} ${shellQuote(base)}`, repoRoot, { allowFailure: true }).status === 0;
  return remoteIsStale ? base : remoteRef;
}

function verifyStackMergeability(stack: CompletedIssue[]): void {
  if (stack.length <= 1) return;
  console.log(`  verifying stacked PR mergeability for ${stack.length} branch(es)`);
  for (const issue of stack) {
    const base = effectiveBaseBranch(issue);
    const mergeBase = resolveFreshRebaseBase(base);
    const ancestor = run(`git merge-base --is-ancestor ${shellQuote(mergeBase)} ${shellQuote(issue.branch)}`, repoRoot, {
      allowFailure: true,
    });
    if (ancestor.status !== 0) {
      throw new Error(`stack branch ${issue.branch} is not based on ${base}; rebase or recreate the stack before publishing`);
    }
    const mergeTree = run(`git merge-tree --write-tree ${shellQuote(mergeBase)} ${shellQuote(issue.branch)}`, repoRoot, {
      allowFailure: true,
    });
    if (mergeTree.status !== 0) {
      throw new Error(`stack branch ${issue.branch} does not merge cleanly into ${base}: ${mergeTree.stderr || mergeTree.stdout}`);
    }
  }
}

async function runSequentially<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (const [index, item] of items.entries()) {
    try {
      results.push({ status: "fulfilled", value: await fn(item) });
    } catch (reason) {
      results.push({ status: "rejected", reason });
      for (let rest = index + 1; rest < items.length; rest += 1) {
        results.push({ status: "rejected", reason: new Error("skipped after earlier stacked issue failed") });
      }
      break;
    }
  }
  return results;
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
    env: { ...runtimeEnv, ...(opts.env ?? {}) },
  });
  const status = result.status === null ? 1 : result.status;
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const termination = result.status === null ? formatSpawnFailure(result.error, result.signal) : "";
  if (status !== 0 && !opts.allowFailure) {
    throw new Error(`command failed (${status}): ${command}\n${stdout}${stderr}${termination}`);
  }
  return { status, stdout, stderr: stderr + termination };
}

function extractPrRef(output: string): string | undefined {
  const url = output.match(/https:\/\/github\.com\/\S+\/pull\/\d+/)?.[0];
  if (url) return url;
  const number = output.match(/#(\d+)/)?.[1];
  return number;
}

function buildPebGlobalArgs(): string {
  const parts: string[] = [];
  if (runtimeEnv.PICASTLE_PEB_ARGS) parts.push(runtimeEnv.PICASTLE_PEB_ARGS);
  if (runtimeEnv.PICASTLE_PEB_REMOTE) {
    parts.push("--remote", shellQuote(runtimeEnv.PICASTLE_PEB_REMOTE));
  }
  if (runtimeEnv.PICASTLE_PEB_REPO) {
    parts.push("-R", shellQuote(runtimeEnv.PICASTLE_PEB_REPO));
  }
  return parts.join(" ");
}

function pebCommand(subcommand: string): string {
  return ["peb", PEB_GLOBAL_ARGS, subcommand].filter(Boolean).join(" ");
}

const PICASTLE_USAGE = `Usage: picastle [--repo PATH] [--plan-only] [--max-iterations N] [--max-issues N] [--concurrency N] [--min-free-gb N] [--base BRANCH] [--clean-targets] [--no-verify] [--no-push] [--no-pr]\n\nEnvironment: PICASTLE_PEB_REMOTE, PICASTLE_PEB_REPO, PICASTLE_ISSUE_STATUS, PICASTLE_ISSUE_LABEL, PICASTLE_MAX_ISSUES, PICASTLE_PENDING_STATUS, PICASTLE_REVIEW_STATUS, PICASTLE_PLAN_ONLY, PICASTLE_VERIFY, PICASTLE_PUSH, PICASTLE_OPEN_PRS, PICASTLE_STACK_PRS, PICASTLE_OPEN_PR_SCAN_LIMIT, PICASTLE_PUBLISHER_AGENT, PICASTLE_REVIEW_REPAIR_CYCLES, PICASTLE_REVIEW_CONCURRENCY, PICASTLE_WORKTREE_READY_COMMAND, PICASTLE_BEFORE_PUSH_COMMAND, PICASTLE_CLEAN_TARGETS, PICASTLE_MIN_FREE_GB, PICASTLE_THINKING`;

class PicastleCliExit extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.exitCode = exitCode;
    this.name = "PicastleCliExit";
  }
}

function isPicastleCliExit(error: unknown): error is PicastleCliExit {
  return error instanceof Error && error.name === "PicastleCliExit" && "exitCode" in error;
}

function parseArgs(args: string[]): CliOptions {
  const parsed: CliOptions = { planOnly: false, noVerify: false, noPush: false, noPr: false };
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
      throw new PicastleCliExit(PICASTLE_USAGE, 0);
    } else {
      die(`unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function die(message: string): never {
  throw new PicastleCliExit(message, 2);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function env(name: string, fallback: string): string {
  return runtimeEnv[name] || fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = runtimeEnv[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function envNonNegativeInt(name: string, fallback: number): number {
  const raw = runtimeEnv[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function envNonNegativeNumber(name: string, fallback: number): number {
  const raw = runtimeEnv[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = runtimeEnv[name];
  if (raw === undefined || raw === "") return fallback;
  return !["0", "false", "no", "off"].includes(raw.toLowerCase());
}

function append(path: string, text: string): void {
  writeFileSync(path, text, { flag: "a" });
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n... truncated ...`;
}

function formatSpawnFailure(error: Error | undefined, signal: NodeJS.Signals | null): string {
  const details = [signal ? `signal ${signal}` : undefined, error ? error.message : undefined].filter(Boolean).join("; ");
  return details ? `spawn failed: ${details}` : "spawn failed with unknown termination";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

if (isDirectRun()) {
  try {
    await runPicastle(process.argv.slice(2));
  } catch (error) {
    if (isPicastleCliExit(error)) {
      const stream = error.exitCode === 0 ? process.stdout : process.stderr;
      stream.write(`${error.message}\n`);
      process.exitCode = error.exitCode;
    } else {
      console.error(formatError(error));
      process.exitCode = 1;
    }
  }
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
  if (!runtimeEnv.HOME) throw new Error("HOME is not set");
  return runtimeEnv.HOME;
}
