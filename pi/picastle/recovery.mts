export type RecoveryIssueLookup =
  | { state: "found" }
  | { state: "not_found"; message?: string }
  | { state: "failed"; message: string };

export type OpenPrRecord = { number?: number; headRefName: string; url: string };

export type RecoveryBranchInput = {
  branch: string;
  issueId?: string;
  title?: string;
  issueStatus?: string;
  issueLookup?: RecoveryIssueLookup;
  ahead: number;
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

  const prefix = "picastle/";
  if (!branch.startsWith(prefix)) return undefined;

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
  if (!branch.startsWith("picastle/")) return undefined;

  const slug = branch.slice("picastle/".length);
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
  const publishedBranchByIssue = new Map<string, RecoveryBranchInput>();
  for (const branch of branches) {
    if (branch.issueId && branch.openPrUrl && isIssueReadyForRecoveryTransition(branch, readyStatus) && !publishedBranchByIssue.has(branch.issueId)) {
      publishedBranchByIssue.set(branch.issueId, branch);
    }
  }

  for (const branch of branches) {
    if (!branch.issueId) {
      plan.ignoredBranches.push({ ...branch, issueId: "<unknown>", reason: "branch name does not contain a pebble id" });
      continue;
    }

    const issueId = branch.issueId;
    const title = branch.title ?? issueId;

    const hasRecoverableWork = branch.dirty || branch.ahead > 0;

    if (!isIssueLookupConfirmed(branch)) {
      const decision = { ...branch, issueId, reason: recoveryIssueLookupReason(branch.issueLookup) };
      if (hasRecoverableWork) {
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

    if (branch.openPrUrl) {
      plan.alreadyPublished.push({ id: issueId, title, branch: branch.branch, worktreePath: branch.worktreePath, prUrl: branch.openPrUrl });
      plan.blockedIssueIds.add(issueId);
      continue;
    }
    const publishedBranch = publishedBranchByIssue.get(issueId);
    if (publishedBranch) {
      const decision = {
        ...branch,
        issueId,
        reason: `issue already has an open PR on ${publishedBranch.branch}; not publishing duplicate`,
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

    const decision = { ...branch, issueId, reason: branch.dirty ? "dirty worktree" : "ahead of base with no open PR" };
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

export function parseOpenPrsByHead(stdout: string): Map<string, string> {
  return new Map(parseOpenPrRecords(stdout).map((pr) => [pr.headRefName, pr.url]));
}

export function findOpenPrForIssue(stdout: string, issueId: string): OpenPrRecord | undefined {
  return parseOpenPrRecords(stdout).find((pr) => {
    const inferredIssueId = extractIssueIdFromBranch(pr.headRefName);
    if (inferredIssueId) return inferredIssueId === issueId;
    return extractIssueIdFromBranch(pr.headRefName, [issueId]) === issueId;
  });
}

export function normalizeOpenPrsJson(stdout: string): string {
  return JSON.stringify(parseOpenPrRecords(stdout));
}

export function parseFirstOpenPrUrl(stdout: string): string | undefined {
  return parseOpenPrRecords(stdout)[0]?.url;
}

export function classifyPebShowFailure(output: string): RecoveryIssueLookup {
  const message = output.trim() || "peb show failed without output";
  if (/\b(not found|no such|unknown (issue|pebble)|does not exist)\b/i.test(message)) {
    return { state: "not_found", message };
  }
  return { state: "failed", message };
}

function parseOpenPrRecords(stdout: string): OpenPrRecord[] {
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
  return parsed.map((item, index) => {
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
    };
  });
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
