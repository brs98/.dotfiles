export type RecoveryIssueLookup =
  | { state: "found" }
  | { state: "not_found"; message?: string }
  | { state: "failed"; message: string };

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
  const matches = [...knownIssueIds]
    .filter((issueId) => issueId.length > 0 && slug.startsWith(`${issueId}-`))
    .sort((a, b) => b.length - a.length || a.localeCompare(b));

  return matches[0];
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
    if (branch.issueId && branch.openPrUrl && !publishedBranchByIssue.has(branch.issueId)) {
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

    if (branch.openPrUrl) {
      plan.alreadyPublished.push({ id: issueId, title, branch: branch.branch, worktreePath: branch.worktreePath, prUrl: branch.openPrUrl });
      plan.blockedIssueIds.add(issueId);
      continue;
    }

    const hasRecoverableWork = branch.dirty || branch.ahead > 0;
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

export function parseOpenPrsByHead(stdout: string): Map<string, string> {
  return new Map(parseOpenPrRecords(stdout).map((pr) => [pr.headRefName, pr.url]));
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

function parseOpenPrRecords(stdout: string): Array<{ number?: number; headRefName: string; url: string }> {
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
