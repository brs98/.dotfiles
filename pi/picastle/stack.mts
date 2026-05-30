import type { PlannedIssue } from "./planner-output.mjs";

export type StackMetadata = {
  stackId: string;
  index: number;
  total: number;
  issueId: string;
  headBranch: string;
  baseBranch: string;
  previousBranch?: string;
  previousHeadSha?: string;
  nextBranch?: string;
};

export type StackedIssue<T extends PlannedIssue = PlannedIssue> = T & { stack: StackMetadata };

export type StackPrRecord = {
  number?: number | string;
  headRefName: string;
  baseRefName?: string;
  url?: string;
  body?: string;
};

export type StackRetargetAction = {
  prRef: string;
  headRefName: string;
  currentBase?: string;
  expectedBase: string;
  stack: StackMetadata;
  currentBody?: string;
  updateBase: boolean;
  updateBody: boolean;
  effectiveBaseChanged: boolean;
};

const STACK_MARKER_START = "<!-- picastle-stack";
const STACK_MARKER_END = "-->";

export function stackIssues<T extends PlannedIssue>(issues: T[], baseBranch: string): Array<StackedIssue<T>> {
  const stackId = defaultStackId(issues);
  return issues.map((issue, index) => ({
    ...issue,
    stack: {
      stackId,
      index: index + 1,
      total: issues.length,
      issueId: issue.id,
      headBranch: issue.branch,
      baseBranch,
      ...(index > 0 ? { previousBranch: issues[index - 1]!.branch } : {}),
      ...(index < issues.length - 1 ? { nextBranch: issues[index + 1]!.branch } : {}),
    },
  }));
}

export function stackBaseBranch(stack: StackMetadata): string {
  return stack.previousBranch ?? stack.baseBranch;
}

export function stackContext(stack: StackMetadata | undefined): string {
  if (!stack) return "Stacked PR mode: disabled for this issue.";
  const base = stackBaseBranch(stack);
  const lines = [
    `Stacked PR mode: this is position ${stack.index}/${stack.total} in stack ${stack.stackId}.`,
    `This branch should target base branch \`${base}\`.`,
  ];
  if (stack.previousBranch) lines.push(`Previous stack branch: \`${stack.previousBranch}\`.`);
  if (stack.nextBranch) lines.push(`Next stack branch: \`${stack.nextBranch}\`.`);
  lines.push("Keep commits scoped to the current issue; do not rewrite earlier stack entries unless explicitly repairing stack integration.");
  return lines.join("\n");
}

export function stackPrBodySection(stack: StackMetadata | undefined): string {
  if (!stack) return "";
  const marker = `${STACK_MARKER_START}\n${JSON.stringify(stack)}\n${STACK_MARKER_END}`;
  const lines = [
    marker,
    "",
    "## Stack",
    "",
    `This PR is **${stack.index} of ${stack.total}** in Picastle stack \`${stack.stackId}\`.`,
    `Base: \`${stackBaseBranch(stack)}\``,
  ];
  if (stack.previousBranch) lines.push(`Previous: \`${stack.previousBranch}\``);
  if (stack.nextBranch) lines.push(`Next: \`${stack.nextBranch}\``);
  return `${lines.join("\n")}\n`;
}

export function stackPebblesComment(stack: StackMetadata | undefined, prRef: string): string | undefined {
  if (!stack) return undefined;
  const lines = [
    `Picastle published stacked PR ${stack.index}/${stack.total}: ${prRef}`,
    `Stack: ${stack.stackId}`,
    `Branch: ${stack.headBranch}`,
    `Base: ${stackBaseBranch(stack)}`,
  ];
  if (stack.previousBranch) lines.push(`Previous stack branch: ${stack.previousBranch}`);
  if (stack.nextBranch) lines.push(`Next stack branch: ${stack.nextBranch}`);
  return lines.join("\n");
}

export function parseStackMetadataJson(value: unknown): StackMetadata | undefined {
  return normalizeStackMetadata(value);
}

export function parseStackMetadataFromBody(body: string | undefined): StackMetadata | undefined {
  if (!body) return undefined;
  const start = body.indexOf(STACK_MARKER_START);
  if (start < 0) return undefined;
  const jsonStart = body.indexOf("\n", start);
  if (jsonStart < 0) return undefined;
  const end = body.indexOf(STACK_MARKER_END, jsonStart + 1);
  if (end < 0) return undefined;
  const raw = body.slice(jsonStart + 1, end).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  return normalizeStackMetadata(parsed);
}

export function planStackRetargets(openPrs: StackPrRecord[], baseBranch: string): StackRetargetAction[] {
  const entries = openPrs
    .map((pr) => ({ pr, stack: parseStackMetadataFromBody(pr.body) }))
    .filter((entry): entry is { pr: StackPrRecord; stack: StackMetadata } => Boolean(entry.stack));

  const byStackId = new Map<string, Array<{ pr: StackPrRecord; stack: StackMetadata }>>();
  for (const entry of entries) {
    const group = byStackId.get(entry.stack.stackId) ?? [];
    group.push(entry);
    byStackId.set(entry.stack.stackId, group);
  }

  const actions: StackRetargetAction[] = [];
  for (const group of byStackId.values()) {
    group.sort((a, b) => a.stack.index - b.stack.index || a.pr.headRefName.localeCompare(b.pr.headRefName));
    for (const [index, entry] of group.entries()) {
      const refreshedStack = relinkStackMetadata(entry.stack, {
        baseBranch,
        headBranch: entry.pr.headRefName,
        previousBranch: group[index - 1]?.pr.headRefName,
        nextBranch: entry.stack.nextBranch,
      });
      const expectedBase = stackBaseBranch(refreshedStack);
      const effectiveBaseChanged = stackBaseBranch(entry.stack) !== expectedBase;
      const updateBase = Boolean(entry.pr.baseRefName && entry.pr.baseRefName !== expectedBase);
      const updateBody = !stackMetadataEqual(entry.stack, refreshedStack);
      if (updateBase || updateBody) {
        actions.push({
          prRef: entry.pr.url || (entry.pr.number ? String(entry.pr.number) : entry.pr.headRefName),
          headRefName: entry.pr.headRefName,
          currentBase: entry.pr.baseRefName,
          expectedBase,
          stack: refreshedStack,
          currentBody: entry.pr.body,
          updateBase,
          updateBody,
          effectiveBaseChanged,
        });
      }
    }
  }

  return actions;
}

export function upsertStackPrBodySection(body: string | undefined, stack: StackMetadata): string {
  const section = stackPrBodySection(stack).trimEnd();
  if (!body) return `${section}\n`;
  const start = body.indexOf(STACK_MARKER_START);
  if (start < 0) return `${section}\n\n${body}`;

  const markerEnd = body.indexOf(STACK_MARKER_END, start);
  if (markerEnd < 0) return `${section}\n\n${body}`;
  const afterMarker = markerEnd + STACK_MARKER_END.length;
  const nextHeading = body.slice(afterMarker).match(/\n## (?!Stack\b)/);
  const end = nextHeading?.index === undefined ? body.length : afterMarker + nextHeading.index;
  return `${body.slice(0, start)}${section}${body.slice(end)}`;
}

export function relinkStackMetadata(
  stack: StackMetadata,
  links: { baseBranch: string; headBranch?: string; previousBranch?: string; nextBranch?: string },
): StackMetadata {
  const relinked: StackMetadata = {
    ...stack,
    headBranch: links.headBranch ?? stack.headBranch,
    baseBranch: links.baseBranch,
  };
  if (links.previousBranch) relinked.previousBranch = links.previousBranch;
  else delete relinked.previousBranch;
  if (links.nextBranch) relinked.nextBranch = links.nextBranch;
  else delete relinked.nextBranch;
  return relinked;
}

export function stackMetadataEqual(a: StackMetadata, b: StackMetadata): boolean {
  return a.stackId === b.stackId &&
    a.index === b.index &&
    a.total === b.total &&
    a.issueId === b.issueId &&
    a.headBranch === b.headBranch &&
    a.baseBranch === b.baseBranch &&
    a.previousBranch === b.previousBranch &&
    a.previousHeadSha === b.previousHeadSha &&
    a.nextBranch === b.nextBranch;
}

function defaultStackId(issues: PlannedIssue[]): string {
  const ids = issues.map((issue) => issue.id).join("-");
  return ids.length <= 80 ? ids : `${issues[0]?.id ?? "stack"}-${issues.at(-1)?.id ?? "tail"}-${issues.length}`;
}

function normalizeStackMetadata(value: unknown): StackMetadata | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const stackId = stringField(record.stackId);
  const issueId = stringField(record.issueId);
  const headBranch = stringField(record.headBranch);
  const baseBranch = stringField(record.baseBranch);
  const index = numberField(record.index);
  const total = numberField(record.total);
  if (!stackId || !issueId || !headBranch || !baseBranch || !index || !total) return undefined;
  return {
    stackId,
    index,
    total,
    issueId,
    headBranch,
    baseBranch,
    ...(stringField(record.previousBranch) ? { previousBranch: stringField(record.previousBranch) } : {}),
    ...(shaField(record.previousHeadSha) ? { previousHeadSha: shaField(record.previousHeadSha) } : {}),
    ...(stringField(record.nextBranch) ? { nextBranch: stringField(record.nextBranch) } : {}),
  };
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function shaField(value: unknown): string | undefined {
  return typeof value === "string" && /^[0-9a-f]{7,40}$/i.test(value) ? value : undefined;
}
