export type RecoveryIssueLookup =
  | { state: "found" }
  | { state: "not_found"; message?: string }
  | { state: "failed"; message: string };

export type RepositoryIdentity = { owner: string; name: string };
export type OpenPrRecord = {
  number?: number;
  headRefName: string;
  url: string;
  isCrossRepository?: boolean;
  headRepositoryOwner?: string;
  headRepositoryName?: string;
};
export type OpenPrParseOptions = { currentRepository?: RepositoryIdentity };
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

export type RecoveryBranchInput = {
  branch: string;
  issueId?: string;
  title?: string;
  issueStatus?: string;
  issueLookup?: RecoveryIssueLookup;
  ahead: number;
  unpushed?: number;
  dirty: boolean;
  worktreePath?: string;
  openPrUrl?: string;
  commitTime?: number;
};

export type RecoveryIssue = {
  id: string;
  title: string;
  branch: string;
  worktreePath?: string;
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
  readyStatus: string,
): RecoveryPlan {
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
    if (branch.issueId && branch.openPrUrl && isIssueReadyForRecoveryTransition(branch, readyStatus) && !openPrBranchByIssue.has(branch.issueId)) {
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

    if (branch.issueStatus !== readyStatus) {
      const reason = branch.issueStatus
        ? `pebble status is ${branch.issueStatus}, not ${readyStatus}`
        : recoveryIssueLookupReason(branch.issueLookup);
      const decision = { ...branch, issueId, reason };
      if (hasRecoverableWork) {
        plan.deferredBranches.push(decision);
        plan.blockedIssueIds.add(issueId);
      } else {
        plan.ignoredBranches.push(decision);
      }
      continue;
    }

    if (branch.openPrUrl && !branch.dirty && unpushed === 0) {
      plan.alreadyPublished.push({ id: issueId, title, branch: branch.branch, worktreePath: branch.worktreePath, prUrl: branch.openPrUrl });
      plan.blockedIssueIds.add(issueId);
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
  return new Map(parseOpenPrRecords(stdout, options).map((pr) => [pr.headRefName, pr.url]));
}

export function findOpenPrForIssue(stdout: string, issueId: string, options: OpenPrParseOptions = {}): OpenPrRecord | undefined {
  return parseOpenPrRecords(stdout, options).find((pr) => {
    if (looksLikePebbleIssueId(issueId) && extractIssueIdFromBranch(pr.headRefName, [issueId]) === issueId) {
      return true;
    }
    return extractIssueIdFromBranch(pr.headRefName) === issueId;
  });
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
  return JSON.stringify(parseOpenPrRecords(stdout, options));
}

export function pebClosureRegistrationSucceeded(result: { status: number; stdout?: string; stderr?: string }): boolean {
  return result.status === 0 || /\balready\b/i.test(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
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
      url: record.url,
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

function isIssueReadyForRecoveryTransition(branch: RecoveryBranchInput, readyStatus: string): boolean {
  return isIssueLookupConfirmed(branch) && branch.issueStatus === readyStatus;
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
  return a.id.localeCompare(b.id) || a.branch.localeCompare(b.branch);
}

function compareRecoveryDecisions(a: RecoveryBranchDecision, b: RecoveryBranchDecision): number {
  return a.issueId.localeCompare(b.issueId) || a.branch.localeCompare(b.branch);
}
