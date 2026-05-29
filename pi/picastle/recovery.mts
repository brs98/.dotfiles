export type RecoveryBranchInput = {
  branch: string;
  issueId?: string;
  title?: string;
  issueStatus?: string;
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
        : "pebble was not found";
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
