import type { StackMetadata } from "./stack.mts";

export type RecoveryIssueLookup =
  | { state: "found" }
  | { state: "not_found"; message?: string }
  | { state: "failed"; message: string };

export type RepositoryIdentity = { owner: string; name: string };
export type OpenPrRecord = {
  number?: number;
  headRefName: string;
  baseRefName?: string;
  url: string;
  body?: string;
  isCrossRepository?: boolean;
  headRepositoryOwner?: string;
  headRepositoryName?: string;
  issueId?: string;
};
export type OpenPrParseOptions = { currentRepository?: RepositoryIdentity; knownIssueIds?: Iterable<string> };
export type PlannedIssueSelection = { id: string; title: string; branch: string };
export type ExistingOpenPr = { headRefName: string; url: string };
export type RecoveryAction =
  | { kind: "declare-pending-closure"; issueId: string; prUrl: string }
  | { kind: "ensure-unpublished-worktree"; issue: RecoveryIssue };
export type PublishFlowDecision =
  | { kind: "use-existing-issue-pr"; existingPr: ExistingOpenPr; shouldPush: false; shouldCreatePr: false }
  | { kind: "update-existing-branch-pr"; existingPr: ExistingOpenPr; shouldPush: true; shouldCreatePr: false }
  | { kind: "create-new-pr"; shouldPush: true; shouldCreatePr: true }
  | { kind: "skip-pr-creation"; shouldPush: true; shouldCreatePr: false };
export type PublishCommandBoundaryDecision = {
  kind: PublishFlowDecision["kind"];
  shouldRunPushBoundary: boolean;
  shouldPush: boolean;
  shouldCreatePr: boolean;
  existingPrUrl?: string;
};

export type RecoveryBranchInput = {
  branch: string;
  issueId?: string;
  title?: string;
  issueStatus?: string;
  issueLabels?: string[];
  issueLookup?: RecoveryIssueLookup;
  ahead: number;
  unpushed?: number;
  dirty: boolean;
  worktreePath?: string;
  openPrUrl?: string;
  commitTime?: number;
  stack?: StackMetadata;
};

export type RecoveryReadinessPolicy = {
  status: string;
  readyLabel?: string;
  requiredLabel?: string;
  predicate?: (branch: RecoveryBranchInput) => boolean;
};

export type RecoveryIssue = {
  id: string;
  title: string;
  branch: string;
  worktreePath?: string;
  stack?: StackMetadata;
};

export type RecoveryBranchDecision = RecoveryBranchInput & {
  issueId: string;
  reason: string;
};

export type RecoveryPlan = {
  interruptedImplementations: RecoveryIssue[];
  unpublishedBranches: RecoveryIssue[];
  alreadyPublished: Array<RecoveryIssue & { prUrl: string }>;
  deferredBranches: RecoveryBranchDecision[];
  ignoredBranches: RecoveryBranchDecision[];
  blockedIssueIds: Set<string>;
};

export function extractIssueIdFromBranch(branch: string, knownIssueIds?: Iterable<string>): string | undefined {
  const knownIssueId = knownIssueIds ? extractKnownIssueIdFromBranch(branch, knownIssueIds) : undefined;
  if (knownIssueId) return knownIssueId;

  const prefix = recoveryBranchPrefix(branch);
  if (!prefix) return undefined;

  const slug = branch.slice(prefix.length);
  const tokens = slug.split("-");
  if (tokens.length < 3 || tokens.some((token) => !/^[a-z0-9_]+$/.test(token))) {
    return undefined;
  }

  for (let index = 1; index < tokens.length - 1; index += 1) {
    if (/^[a-z0-9]{3}$/.test(tokens[index]!)) {
      return tokens.slice(0, index + 1).join("-");
    }
  }

  return undefined;
}

function extractKnownIssueIdFromBranch(branch: string, knownIssueIds: Iterable<string>): string | undefined {
  const prefix = recoveryBranchPrefix(branch);
  if (!prefix) return undefined;

  const slug = branch.slice(prefix.length);
  let bestMatch: string | undefined;
  for (const issueId of knownIssueIds) {
    if (!issueId || !slug.startsWith(`${issueId}-`)) continue;
    if (
      !bestMatch ||
      issueId.length > bestMatch.length ||
      (issueId.length === bestMatch.length && issueId.localeCompare(bestMatch) < 0)
    ) {
      bestMatch = issueId;
    }
  }

  return bestMatch;
}

export function buildRecoveryPlan(
  branches: RecoveryBranchInput[],
  readiness: string | RecoveryReadinessPolicy,
): RecoveryPlan {
  const readyPolicy = normalizeRecoveryReadinessPolicy(readiness);
  const plan: RecoveryPlan = {
    interruptedImplementations: [],
    unpublishedBranches: [],
    alreadyPublished: [],
    deferredBranches: [],
    ignoredBranches: [],
    blockedIssueIds: new Set<string>(),
  };
  const activeByIssue = new Map<string, RecoveryBranchDecision[]>();
  const openPrBranchByIssue = new Map<string, RecoveryBranchInput>();
  for (const branch of branches) {
    if (branch.issueId && branch.openPrUrl && isIssueReadyForRecoveryTransition(branch, readyPolicy) && !openPrBranchByIssue.has(branch.issueId)) {
      openPrBranchByIssue.set(branch.issueId, branch);
    }
  }

  for (const branch of branches) {
    if (!branch.issueId) {
      plan.ignoredBranches.push({ ...branch, issueId: "<unknown>", reason: "branch name does not contain a pebble id" });
      continue;
    }

    const issueId = branch.issueId;
    const title = branch.title ?? issueId;
    const unpushed = branch.unpushed ?? 0;

    const hasRecoverableWork = branch.dirty || branch.ahead > 0 || unpushed > 0;

    if (!isIssueLookupConfirmed(branch)) {
      const decision = { ...branch, issueId, reason: recoveryIssueLookupReason(branch.issueLookup) };
      if (hasRecoverableWork || branch.openPrUrl) {
        plan.deferredBranches.push(decision);
        plan.blockedIssueIds.add(issueId);
      } else {
        plan.ignoredBranches.push(decision);
      }
      continue;
    }

    if (!isIssueReadyForRecoveryTransition(branch, readyPolicy)) {
      const reason = recoveryReadinessFailureReason(branch, readyPolicy);
      const decision = { ...branch, issueId, reason };
      if (hasRecoverableWork || branch.openPrUrl) {
        plan.deferredBranches.push(decision);
        plan.blockedIssueIds.add(issueId);
      } else {
        plan.ignoredBranches.push(decision);
      }
      continue;
    }

    const openPrBranch = openPrBranchByIssue.get(issueId);
    if (openPrBranch && openPrBranch.branch !== branch.branch) {
      const decision = {
        ...branch,
        issueId,
        reason: `issue already has an open PR on ${openPrBranch.branch}; not publishing duplicate`,
      };
      if (hasRecoverableWork) plan.deferredBranches.push(decision);
      else plan.ignoredBranches.push(decision);
      plan.blockedIssueIds.add(issueId);
      continue;
    }

    if (branch.openPrUrl && !branch.dirty && unpushed === 0) {
      plan.alreadyPublished.push({ id: issueId, title, branch: branch.branch, worktreePath: branch.worktreePath, ...(branch.stack ? { stack: branch.stack } : {}), prUrl: branch.openPrUrl });
      plan.blockedIssueIds.add(issueId);
      continue;
    }

    if (!hasRecoverableWork) {
      plan.ignoredBranches.push({ ...branch, issueId, reason: "zero commits ahead of base and clean" });
      continue;
    }

    const decision = {
      ...branch,
      issueId,
      reason: branch.dirty
        ? "dirty worktree"
        : branch.openPrUrl && unpushed > 0
          ? `open PR branch has ${unpushed} unpushed commit(s)`
          : "ahead of base with no open PR",
    };
    const active = activeByIssue.get(issueId) ?? [];
    active.push(decision);
    activeByIssue.set(issueId, active);
    plan.blockedIssueIds.add(issueId);
  }

  for (const active of activeByIssue.values()) {
    active.sort(compareRecoveryCandidates);
    const selected = active[0]!;
    const issue = {
      id: selected.issueId,
      title: selected.title ?? selected.issueId,
      branch: selected.branch,
      worktreePath: selected.worktreePath,
      ...(selected.stack ? { stack: selected.stack } : {}),
    };
    if (selected.dirty) {
      plan.interruptedImplementations.push(issue);
    } else {
      plan.unpublishedBranches.push(issue);
    }

    for (const duplicate of active.slice(1)) {
      plan.deferredBranches.push({
        ...duplicate,
        reason: `duplicate local Picastle branch for ${selected.issueId}; selected ${selected.branch} for recovery`,
      });
    }
  }

  plan.interruptedImplementations.sort(compareRecoveryIssues);
  plan.unpublishedBranches.sort(compareRecoveryIssues);
  plan.alreadyPublished.sort(compareRecoveryIssues);
  plan.deferredBranches.sort(compareRecoveryDecisions);
  plan.ignoredBranches.sort(compareRecoveryDecisions);

  return plan;
}

export function assertSafeRecoveryBranchName(branch: string): void {
  if (!/^picastle\/[a-z0-9][a-z0-9._-]*$/.test(branch) || branch.includes("..") || branch.includes("@{") || branch.endsWith(".lock")) {
    throw new Error(`unsafe Picastle recovery branch name: ${branch}`);
  }
}

export function parseKnownIssueIdsJson(stdout: string): string[] {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("failed to parse peb issue id query JSON: empty output");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`failed to parse peb issue id query JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { data?: unknown }).data)
      ? (parsed as { data: unknown[] }).data
      : undefined;
  if (!items) {
    throw new Error("failed to parse peb issue id query JSON: expected an array or an object with a data array");
  }

  const ids = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== "object") {
      throw new Error(`failed to parse peb issue id query JSON: entry ${index} is not an object`);
    }
    const id = (item as { id?: unknown }).id;
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`failed to parse peb issue id query JSON: entry ${index} has invalid id`);
    }
    ids.add(id);
  }

  return [...ids].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

export function parseOpenPrsByHead(stdout: string, options: OpenPrParseOptions = {}): Map<string, string> {
  return new Map(parseRecognizedRecoveryPrRecords(stdout, options).map((pr) => [pr.headRefName, pr.url]));
}

export function findOpenPrForIssue(stdout: string, issueId: string, options: OpenPrParseOptions = {}): OpenPrRecord | undefined {
  const knownIssueIds = options.knownIssueIds ? new Set(options.knownIssueIds) : undefined;
  knownIssueIds?.add(issueId);

  return parseRecognizedRecoveryPrRecords(stdout, options).find((pr) => {
    if (knownIssueIds) return extractIssueIdFromOpenPrHead(pr.headRefName, knownIssueIds) === issueId;
    if (looksLikePebbleIssueId(issueId) && extractIssueIdFromBranch(pr.headRefName, [issueId]) === issueId) {
      return true;
    }
    return extractIssueIdFromBranch(pr.headRefName) === issueId;
  });
}

export function extractIssueIdFromOpenPrHead(head: string, knownIssueIds?: Iterable<string>): string | undefined {
  return extractIssueIdFromBranch(head, knownIssueIds);
}

export function selectRecoveryActions(
  plan: RecoveryPlan,
  options: { readOnly?: boolean } = {},
): RecoveryAction[] {
  if (options.readOnly) return [];
  return [
    ...plan.alreadyPublished.map((issue) => ({
      kind: "declare-pending-closure" as const,
      issueId: issue.id,
      prUrl: issue.prUrl,
    })),
    ...plan.unpublishedBranches.map((issue) => ({
      kind: "ensure-unpublished-worktree" as const,
      issue,
    })),
  ];
}

export function selectRecoveredUnpublishedBranches(
  plan: RecoveryPlan,
  options: { readOnly?: boolean } = {},
): RecoveryIssue[] {
  return options.readOnly ? [] : plan.unpublishedBranches;
}

export function decidePublishFlow(
  branch: string,
  existingPr: ExistingOpenPr | undefined,
  options: { openPrs?: boolean } = {},
): PublishFlowDecision {
  if (existingPr && existingPr.headRefName !== branch) {
    return { kind: "use-existing-issue-pr", existingPr, shouldPush: false, shouldCreatePr: false };
  }
  if (existingPr) {
    return { kind: "update-existing-branch-pr", existingPr, shouldPush: true, shouldCreatePr: false };
  }
  if (options.openPrs ?? true) {
    return { kind: "create-new-pr", shouldPush: true, shouldCreatePr: true };
  }
  return { kind: "skip-pr-creation", shouldPush: true, shouldCreatePr: false };
}

export function decidePublishCommandBoundary(
  flow: PublishFlowDecision,
  options: { push?: boolean } = {},
): PublishCommandBoundaryDecision {
  const shouldPush = flow.shouldPush && (options.push ?? true);
  return {
    kind: flow.kind,
    shouldRunPushBoundary: shouldPush,
    shouldPush,
    shouldCreatePr: flow.shouldCreatePr,
    ...("existingPr" in flow ? { existingPrUrl: flow.existingPr.url } : {}),
  };
}

export function isRecognizedRecoveryPrHead(branch: string): boolean {
  return recoveryBranchPrefix(branch) !== undefined;
}

export function validatePlannedIssueSelections(
  plannedIssues: unknown[],
  candidateIssues: unknown[],
  options: {
    suppressedIssueIds?: Iterable<string>;
    normalizeBranch?: (branch: string, id: string, title: string) => string;
  } = {},
): PlannedIssueSelection[] {
  const candidateIds = new Set<string>();
  for (const [index, candidate] of candidateIssues.entries()) {
    const id = readRecordString(candidate, "id");
    if (!id) throw new Error(`Candidate issue at index ${index} is missing id`);
    candidateIds.add(id);
  }

  const suppressedIssueIds = new Set(options.suppressedIssueIds ?? []);
  const knownIssueIds = new Set([...candidateIds, ...suppressedIssueIds]);
  const seen = new Set<string>();
  return plannedIssues.map((plannedIssue, index) => {
    const id = readRecordString(plannedIssue, "id");
    const title = readRecordString(plannedIssue, "title");
    const branch = readRecordString(plannedIssue, "branch");
    if (!id || !title || !branch) {
      throw new Error(`Invalid planned issue at index ${index}: ${JSON.stringify(plannedIssue)}`);
    }
    if (seen.has(id)) throw new Error(`Planner selected duplicate issue id ${id}`);
    seen.add(id);
    if (suppressedIssueIds.has(id)) throw new Error(`Planner selected suppressed issue id ${id}`);
    if (!candidateIds.has(id)) throw new Error(`Planner selected non-candidate issue id ${id}`);

    const normalizedBranch = options.normalizeBranch ? options.normalizeBranch(branch, id, title) : branch;
    assertSafeRecoveryBranchName(normalizedBranch);
    const branchIssueId = extractIssueIdFromBranch(normalizedBranch, knownIssueIds);
    if (!branchIssueId) {
      throw new Error(`Planner selected branch ${normalizedBranch} for issue ${id}, but branch name does not contain a valid issue id`);
    }
    if (suppressedIssueIds.has(branchIssueId)) {
      throw new Error(`Planner selected branch targets suppressed issue id ${branchIssueId}: ${normalizedBranch}`);
    }
    if (branchIssueId !== id) {
      throw new Error(`Planner selected branch targets issue id ${branchIssueId}, not selected issue id ${id}: ${normalizedBranch}`);
    }
    return {
      id,
      title,
      branch: normalizedBranch,
    };
  });
}

export function normalizeOpenPrsJson(stdout: string, options: OpenPrParseOptions = {}): string {
  return JSON.stringify(parseRecognizedRecoveryPrRecords(stdout, options).map((pr) => enrichOpenPrRecordWithIssueId(pr, options.knownIssueIds)));
}

export function filterCandidateIssuesWithoutOpenPrs(
  candidateIssues: unknown[],
  openPrsStdout: string,
  options: OpenPrParseOptions = {},
): unknown[] {
  const candidateIds = new Set<string>();
  for (const [index, candidate] of candidateIssues.entries()) {
    const id = readRecordString(candidate, "id");
    if (!id) throw new Error(`Candidate issue at index ${index} is missing id`);
    candidateIds.add(id);
  }

  const knownIssueIds = new Set(options.knownIssueIds ?? []);
  for (const id of candidateIds) knownIssueIds.add(id);

  const openPrIssueIds = new Set<string>();
  for (const pr of parseRecognizedRecoveryPrRecords(openPrsStdout, options)) {
    const issueId = resolveOpenPrIssueId(pr.headRefName, knownIssueIds);
    if (issueId) openPrIssueIds.add(issueId);
  }

  return candidateIssues.filter((candidate) => {
    const id = readRecordString(candidate, "id");
    return Boolean(id) && !openPrIssueIds.has(id);
  });
}

export function pebClosureRegistrationSucceeded(result: { status: number; stdout?: string; stderr?: string }): boolean {
  return result.status === 0;
}

export function parseFirstOpenPrUrl(stdout: string, options: OpenPrParseOptions = {}): string | undefined {
  return parseOpenPrRecords(stdout, options)[0]?.url;
}

export function classifyPebShowFailure(output: string): RecoveryIssueLookup {
  const message = output.trim() || "peb show failed without output";
  if (/\b(not found|no such|unknown (issue|pebble)|does not exist)\b/i.test(message)) {
    return { state: "not_found", message };
  }
  return { state: "failed", message };
}

function looksLikePebbleIssueId(issueId: string): boolean {
  return /-[a-z0-9]{3}$/.test(issueId);
}

function enrichOpenPrRecordWithIssueId(pr: OpenPrRecord, knownIssueIds?: Iterable<string>): OpenPrRecord {
  const issueId = resolveOpenPrIssueId(pr.headRefName, knownIssueIds);
  return issueId ? { ...pr, issueId } : pr;
}

function resolveOpenPrIssueId(headRefName: string, knownIssueIds?: Iterable<string>): string | undefined {
  if (!knownIssueIds) return undefined;
  return extractIssueIdFromOpenPrHead(headRefName, knownIssueIds);
}

function recoveryBranchPrefix(branch: string): "picastle/" | "sandcastle/" | undefined {
  if (branch.startsWith("picastle/")) return "picastle/";
  if (branch.startsWith("sandcastle/")) return "sandcastle/";
  return undefined;
}

function readRecordString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function parseRecognizedRecoveryPrRecords(stdout: string, options: OpenPrParseOptions = {}): OpenPrRecord[] {
  return parseOpenPrRecords(stdout, options).filter((pr) => isRecognizedRecoveryPrHead(pr.headRefName));
}

function parseOpenPrRecords(stdout: string, options: OpenPrParseOptions = {}): OpenPrRecord[] {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("failed to parse gh pr list JSON: empty output");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`failed to parse gh pr list JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("failed to parse gh pr list JSON: expected an array");
  }
  const records = parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`failed to parse gh pr list JSON: entry ${index} is not an object`);
    }
    const record = item as Record<string, unknown>;
    if (typeof record.headRefName !== "string" || record.headRefName.length === 0) {
      throw new Error(`failed to parse gh pr list JSON: entry ${index} has invalid headRefName`);
    }
    if (typeof record.url !== "string" || record.url.length === 0) {
      throw new Error(`failed to parse gh pr list JSON: entry ${index} has invalid url`);
    }
    const number = record.number === undefined ? undefined : Number(record.number);
    return {
      ...(Number.isFinite(number) ? { number } : {}),
      headRefName: record.headRefName,
      ...(typeof record.baseRefName === "string" && record.baseRefName.length > 0 ? { baseRefName: record.baseRefName } : {}),
      url: record.url,
      ...(typeof record.body === "string" ? { body: record.body } : {}),
      ...(typeof record.isCrossRepository === "boolean" ? { isCrossRepository: record.isCrossRepository } : {}),
      ...extractHeadRepositoryIdentity(record),
    };
  });

  if (!options.currentRepository) return records;
  return records.filter((record, index) => shouldConsiderSameRepositoryPr(record, options.currentRepository!, index));
}

function extractHeadRepositoryIdentity(record: Record<string, unknown>): Pick<OpenPrRecord, "headRepositoryOwner" | "headRepositoryName"> {
  const repository = readObject(record.headRepository);
  const nameWithOwner = readString(repository?.nameWithOwner);
  const slashIndex = nameWithOwner?.indexOf("/") ?? -1;
  const owner = readGitHubLogin(record.headRepositoryOwner) ?? readGitHubLogin(repository?.owner) ?? (slashIndex > 0 ? nameWithOwner!.slice(0, slashIndex) : undefined);
  const name = readString(record.headRepositoryName) ?? readString(repository?.name) ?? (slashIndex > 0 ? nameWithOwner!.slice(slashIndex + 1) : undefined);
  return {
    ...(owner ? { headRepositoryOwner: owner } : {}),
    ...(name ? { headRepositoryName: name } : {}),
  };
}

function shouldConsiderSameRepositoryPr(record: OpenPrRecord, currentRepository: RepositoryIdentity, index: number): boolean {
  const hasRepositoryIdentity = Boolean(record.headRepositoryOwner && record.headRepositoryName);
  const identityMatches = hasRepositoryIdentity
    ? repositoryPartEquals(record.headRepositoryOwner!, currentRepository.owner) && repositoryPartEquals(record.headRepositoryName!, currentRepository.name)
    : undefined;

  if (record.isCrossRepository === true) {
    if (identityMatches === true) {
      throw new Error(`failed to parse gh pr list JSON: entry ${index} has contradictory cross-repository identity`);
    }
    return false;
  }

  if (record.isCrossRepository === false) {
    if (identityMatches === false) {
      throw new Error(`failed to parse gh pr list JSON: entry ${index} has contradictory same-repository identity`);
    }
    return true;
  }

  if (identityMatches !== undefined) return identityMatches;
  throw new Error(`failed to parse gh pr list JSON: entry ${index} is missing PR head repository identity`);
}

function repositoryPartEquals(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readGitHubLogin(value: unknown): string | undefined {
  return readString(value) ?? readString(readObject(value)?.login) ?? readString(readObject(value)?.name);
}

function normalizeRecoveryReadinessPolicy(readiness: string | RecoveryReadinessPolicy): RecoveryReadinessPolicy {
  return typeof readiness === "string" ? { status: readiness } : readiness;
}

function isIssueReadyForRecoveryTransition(branch: RecoveryBranchInput, readyPolicy: RecoveryReadinessPolicy): boolean {
  if (!isIssueLookupConfirmed(branch)) return false;
  if (readyPolicy.predicate?.(branch)) return true;
  if (branch.issueStatus === readyPolicy.status && hasRequiredRecoveryLabel(branch, readyPolicy.requiredLabel)) return true;
  return Boolean(
    readyPolicy.readyLabel &&
      branch.issueStatus === "open" &&
      branch.issueLabels?.includes(readyPolicy.readyLabel) &&
      hasRequiredRecoveryLabel(branch, readyPolicy.requiredLabel),
  );
}

function recoveryReadinessFailureReason(branch: RecoveryBranchInput, readyPolicy: RecoveryReadinessPolicy): string {
  if (!branch.issueStatus) return recoveryIssueLookupReason(branch.issueLookup);
  if (readyPolicy.requiredLabel && !branch.issueLabels?.includes(readyPolicy.requiredLabel)) {
    return `pebble is missing required label ${readyPolicy.requiredLabel}`;
  }
  if (branch.issueStatus === "open" && readyPolicy.readyLabel && !branch.issueLabels?.includes(readyPolicy.readyLabel)) {
    return `pebble status is open without ready label ${readyPolicy.readyLabel}`;
  }
  return `pebble status is ${branch.issueStatus}, not ${readyPolicy.status}`;
}

function hasRequiredRecoveryLabel(branch: RecoveryBranchInput, requiredLabel: string | undefined): boolean {
  return !requiredLabel || Boolean(branch.issueLabels?.includes(requiredLabel));
}

function isIssueLookupConfirmed(branch: RecoveryBranchInput): boolean {
  // Unit tests and older callers may provide only issueStatus. Runtime recovery
  // always sets issueLookup; when it says failed/not_found, fail closed so open
  // PR branches cannot mutate Pebbles as "already published".
  return branch.issueLookup?.state === "found" || (branch.issueLookup === undefined && branch.issueStatus !== undefined);
}

function recoveryIssueLookupReason(lookup: RecoveryIssueLookup | undefined): string {
  if (lookup?.state === "failed") return `pebble lookup failed: ${lookup.message}`;
  return "pebble was not found";
}

function compareRecoveryCandidates(a: RecoveryBranchDecision, b: RecoveryBranchDecision): number {
  if (a.dirty !== b.dirty) return a.dirty ? -1 : 1;
  if (a.ahead !== b.ahead) return b.ahead - a.ahead;
  if ((a.commitTime ?? 0) !== (b.commitTime ?? 0)) return (b.commitTime ?? 0) - (a.commitTime ?? 0);
  return a.branch.localeCompare(b.branch);
}

function compareRecoveryIssues(a: RecoveryIssue, b: RecoveryIssue): number {
  if (a.stack?.stackId && a.stack.stackId === b.stack?.stackId) {
    return a.stack.index - b.stack.index || a.id.localeCompare(b.id) || a.branch.localeCompare(b.branch);
  }
  return a.id.localeCompare(b.id) || a.branch.localeCompare(b.branch);
}

function compareRecoveryDecisions(a: RecoveryBranchDecision, b: RecoveryBranchDecision): number {
  return a.issueId.localeCompare(b.issueId) || a.branch.localeCompare(b.branch);
}
