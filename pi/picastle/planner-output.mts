export type PlannedIssue = { id: string; title: string; branch: string };

export type PlannerSkipCategory =
  | "existing_pr"
  | "dependency"
  | "overlap_risk"
  | "missing_context"
  | "policy_status"
  | "other";

export type PlannerSkippedIssue = {
  id: string;
  title: string;
  category: PlannerSkipCategory;
  reason: string;
  blockers: string[];
};

export type PlannerDecision = {
  issues: PlannedIssue[];
  skipped: PlannerSkippedIssue[];
  consideredCount: number;
  hasSyntheticExplanations: boolean;
};

export type PlannerCandidateInfo = { id: string; title: string };
export type PlannerOpenPr = { number?: number | string; headRefName: string; url?: string };

export function parsePlannerContext(options: { candidates: unknown[]; openPrs: unknown[] }): {
  candidates: PlannerCandidateInfo[];
  openPrs: PlannerOpenPr[];
} {
  return {
    candidates: options.candidates.map(candidateInfo),
    openPrs: options.openPrs.map(openPrInfo),
  };
}

export function parsePlannerPlan(
  stdout: string,
  options: { candidates: unknown[]; openPrs: unknown[]; maxIssues?: number },
): PlannerDecision {
  const match = stdout.match(/<plan>([\s\S]*?)<\/plan>/);
  if (!match) throw new Error("Planner did not produce a <plan> block");

  const parsed = JSON.parse(match[1]!);
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.issues)) {
    throw new Error("Planner <plan> JSON must contain an issues array");
  }

  const { candidates, openPrs } = parsePlannerContext(options);
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  const seenPlannedIds = new Set<string>();
  const planned = parsed.issues.map((raw: unknown) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Invalid planned issue: ${JSON.stringify(raw)}`);
    }

    const issue = raw as Partial<PlannedIssue>;
    const id = stringField(issue.id);
    const title = stringField(issue.title);
    const branch = stringField(issue.branch);
    if (!id || !title || !branch) {
      throw new Error(`Invalid planned issue: ${JSON.stringify(issue)}`);
    }
    if (seenPlannedIds.has(id)) {
      throw new Error(`Planner returned duplicate planned issue id: ${id}`);
    }
    if (!candidateById.has(id)) {
      throw new Error(`Planner returned planned issue id not present in candidates: ${id}`);
    }
    seenPlannedIds.add(id);

    return {
      id,
      title,
      branch: normalizeBranch(branch, id),
    };
  });
  const issues = options.maxIssues && options.maxIssues > 0 ? planned.slice(0, options.maxIssues) : planned;
  const plannedIds = new Set(issues.map((issue) => issue.id));
  const allPlannedIds = new Set(planned.map((issue) => issue.id));

  let hasSyntheticExplanations = planned.length !== issues.length;
  const skippedById = new Map<string, PlannerSkippedIssue>();
  const seenSkippedIds = new Set<string>();
  for (const raw of extractSkippedItems(parsed)) {
    const skipped = parseSkippedItem(raw, candidateById);
    if (seenSkippedIds.has(skipped.id)) {
      throw new Error(`Planner returned duplicate skipped issue id: ${skipped.id}`);
    }
    seenSkippedIds.add(skipped.id);
    if (!candidateById.has(skipped.id)) {
      throw new Error(`Planner returned skipped issue id not present in candidates: ${skipped.id}`);
    }
    if (allPlannedIds.has(skipped.id)) {
      throw new Error(`Planner returned issue id in both issues and skipped: ${skipped.id}`);
    }
    skippedById.set(skipped.id, skipped);
  }

  for (const issue of planned.slice(issues.length)) {
    skippedById.set(issue.id, {
      id: issue.id,
      title: issue.title,
      category: "policy_status",
      reason: `Selected by planner but skipped by PICASTLE_MAX_ISSUES=${options.maxIssues}.`,
      blockers: [],
    });
  }

  for (const candidate of candidates) {
    if (plannedIds.has(candidate.id) || skippedById.has(candidate.id)) continue;
    const openPr = findOpenPrForIssue(candidate.id, openPrs);
    skippedById.set(candidate.id, openPr ? existingPrSkip(candidate, openPr) : unexplainedSkip(candidate));
    hasSyntheticExplanations = true;
  }

  return {
    issues,
    skipped: [...skippedById.values()],
    consideredCount: candidates.length,
    hasSyntheticExplanations,
  };
}

export function formatPlannerBlockedSummary(decision: PlannerDecision): string[] {
  const lines: string[] = [];
  if (decision.consideredCount === 0) {
    lines.push("Planner considered 0 candidate(s); no issues matched the Picastle queue filters.");
    return lines;
  }

  lines.push(
    `Planner considered ${decision.consideredCount} candidate(s); selected ${decision.issues.length}, skipped ${decision.skipped.length}.`,
  );

  if (decision.skipped.length === 0) return lines;

  const counts = new Map<PlannerSkipCategory, number>();
  for (const skipped of decision.skipped) counts.set(skipped.category, (counts.get(skipped.category) ?? 0) + 1);
  lines.push(
    `Skipped reasons: ${[...counts.entries()]
      .map(([category, count]) => `${categoryLabel(category)}: ${count}`)
      .join(", ")}.`,
  );

  const maxRows = 12;
  for (const skipped of decision.skipped.slice(0, maxRows)) {
    const blockers = skipped.blockers.length > 0 ? ` [blockers: ${skipped.blockers.join(", ")}]` : "";
    lines.push(`  - ${skipped.id}: ${categoryLabel(skipped.category)} — ${truncateLine(skipped.reason, 160)}${blockers}`);
  }
  if (decision.skipped.length > maxRows) {
    lines.push(`  … ${decision.skipped.length - maxRows} more skipped candidate(s); see planner audit artifact.`);
  }
  if (decision.hasSyntheticExplanations) {
    lines.push("Some skip reasons were synthesized by Picastle because the planner omitted explicit explanations.");
  }

  return lines;
}

export function normalizeBranch(branch: string, id: string): string {
  let normalized: string;
  if (branch.startsWith("picastle/")) {
    normalized = branch;
  } else if (branch.startsWith("sandcastle/")) {
    normalized = branch.replace(/^sandcastle\//, "picastle/");
  } else {
    throw new Error(
      `Planner branch for ${id} must use picastle/${id}-... (sandcastle/ is also accepted for migration), got ${JSON.stringify(branch)}`,
    );
  }

  const pattern = new RegExp(`^picastle/${escapeRegExp(id)}-.+`);
  if (!pattern.test(normalized)) {
    throw new Error(
      `Planner branch for ${id} must normalize to picastle/${id}-..., got ${JSON.stringify(normalized)}`,
    );
  }
  return normalized;
}

function extractSkippedItems(parsed: Record<string, unknown>): unknown[] {
  const result: unknown[] = [];
  for (const key of ["skipped", "blocked", "filtered", "declined"] as const) {
    if (!(key in parsed)) continue;
    const items = parsed[key];
    if (!Array.isArray(items)) {
      throw new Error(`Planner <plan> ${key} field must be an array when present`);
    }
    result.push(...items);
  }
  return result;
}

function parseSkippedItem(
  raw: unknown,
  candidateById: Map<string, PlannerCandidateInfo>,
): PlannerSkippedIssue {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`Invalid skipped issue: ${JSON.stringify(raw)}`);
  }
  const item = raw as Record<string, unknown>;
  const id = stringField(item.id) || stringField(item.issue_id) || stringField(item.issueId);
  if (!id) {
    throw new Error(`Invalid skipped issue: ${JSON.stringify(item)}`);
  }
  const candidate = candidateById.get(id);
  const title = stringField(item.title) || candidate?.title || id;
  return {
    id,
    title,
    category: normalizeCategory(
      stringField(item.category) || stringField(item.reason_category) || stringField(item.reasonCategory) || stringField(item.type),
    ),
    reason:
      stringField(item.reason) ||
      stringField(item.summary) ||
      stringField(item.details) ||
      "Planner skipped this candidate without a detailed reason.",
    blockers: skippedBlockers(item),
  };
}

function candidateInfo(candidate: unknown, index: number): PlannerCandidateInfo {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error(`Invalid candidate issue at index ${index}: ${JSON.stringify(candidate)}`);
  }
  const item = candidate as Record<string, unknown>;
  if (typeof item.id !== "string" || item.id.length === 0) {
    throw new Error(`Invalid candidate issue id at index ${index}: expected a non-empty string`);
  }
  if (item.title !== undefined && item.title !== null && typeof item.title !== "string") {
    throw new Error(`Invalid candidate issue title for ${item.id}: expected a string when present`);
  }
  const title = typeof item.title === "string" && item.title ? item.title : item.id;
  return { id: item.id, title };
}

function openPrInfo(openPr: unknown, index: number): PlannerOpenPr {
  if (!openPr || typeof openPr !== "object" || Array.isArray(openPr)) {
    throw new Error(`Invalid open PR record at index ${index}: ${JSON.stringify(openPr)}`);
  }
  const item = openPr as Record<string, unknown>;
  const headRefName = item.headRefName;
  const number = item.number;
  const url = item.url;
  if (typeof headRefName !== "string" || headRefName.length === 0) {
    throw new Error(`Invalid open PR headRefName at index ${index}: expected a non-empty string`);
  }
  if (number !== undefined && typeof number !== "number" && typeof number !== "string") {
    throw new Error(`Invalid open PR number for ${headRefName}: expected a number or string when present`);
  }
  if (url !== undefined && url !== null && typeof url !== "string") {
    throw new Error(`Invalid open PR url for ${headRefName}: expected a string when present`);
  }

  const result: PlannerOpenPr = { headRefName };
  if (typeof number === "number" || typeof number === "string") result.number = number;
  if (typeof url === "string") result.url = url;
  return result;
}

function existingPrSkip(candidate: { id: string; title: string }, pr: PlannerOpenPr): PlannerSkippedIssue {
  const number = stringField(pr.number);
  const url = stringField(pr.url);
  const head = stringField(pr.headRefName);
  const ref = number ? `#${number}` : url || head || "an open PR";
  return {
    id: candidate.id,
    title: candidate.title,
    category: "existing_pr",
    reason: `Open PR ${ref} is already in flight for ${candidate.id}.`,
    blockers: [ref],
  };
}

function unexplainedSkip(candidate: { id: string; title: string }): PlannerSkippedIssue {
  return {
    id: candidate.id,
    title: candidate.title,
    category: "missing_context",
    reason: "Planner selected no work for this candidate but did not provide an explicit skip reason.",
    blockers: [],
  };
}

function findOpenPrForIssue(id: string, openPrs: PlannerOpenPr[]): PlannerOpenPr | undefined {
  const escaped = escapeRegExp(id);
  const branchPattern = new RegExp(`^(?:picastle|sandcastle)/${escaped}-.+`);
  return openPrs.find((pr) => branchPattern.test(stringField(pr.headRefName)));
}

function skippedBlockers(item: Record<string, unknown>): string[] {
  for (const key of ["blockers", "blocked_by", "blockedBy"] as const) {
    if (!(key in item)) continue;
    const blockers = stringArrayField(item[key]);
    if (!blockers) {
      throw new Error(`Invalid skipped issue blockers for ${stringField(item.id) || "unknown issue"}: must be an array`);
    }
    return blockers;
  }
  return [];
}

function normalizeCategory(value: string): PlannerSkipCategory {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (["existing_pr", "open_pr", "pr", "in_flight", "already_in_flight"].includes(normalized)) return "existing_pr";
  if (["dependency", "dependencies", "blocked", "blocked_by", "depends_on"].includes(normalized)) return "dependency";
  if (["overlap", "overlap_risk", "conflict", "conflict_risk", "file_overlap"].includes(normalized)) return "overlap_risk";
  if (["missing_context", "needs_context", "insufficient_context", "unknown"].includes(normalized)) return "missing_context";
  if (["policy", "policy_status", "status", "label", "queue_policy"].includes(normalized)) return "policy_status";
  return "other";
}

function categoryLabel(category: PlannerSkipCategory): string {
  return category.replace(/_/g, " ").replace(/^existing pr$/, "existing PR");
}

function stringField(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function stringArrayField(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(stringField).filter(Boolean);
}

function truncateLine(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
