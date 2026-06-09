import { basename, dirname, join } from "node:path";
import type { PebOps } from "./peb.js";
import {
  DEFAULT_CONCURRENCY,
  isClosed,
  isInProgress,
  jsonData,
  type LabelPolicy,
  type PebIssue,
  type Plan,
  type PlanItem,
  type Show,
  type Workflow,
} from "./shared.js";

export type PebblesCommandContext = {
  cwd: string;
  hasUI: boolean;
  ui: {
    select: (prompt: string, options: string[]) => Promise<string | undefined>;
    editor: (prompt: string, initialText?: string) => Promise<string | undefined>;
    confirm: (title: string, message: string) => Promise<boolean>;
    notify: (message: string, level?: "info" | "warning" | "error") => void;
  };
};

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "work";
}

function getDependencyId(dep: unknown): string | undefined {
  if (!dep || typeof dep !== "object") return undefined;
  const record = dep as Record<string, unknown>;
  for (const key of [
    "parent_id",
    "depends_on_id",
    "dependency_id",
    "target_id",
    "id",
    "issue_id",
  ]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  const issue = record.issue;
  if (
    issue &&
    typeof issue === "object" &&
    typeof (issue as Record<string, unknown>).id === "string"
  ) {
    return (issue as Record<string, string>).id;
  }
  return undefined;
}

function dependencyLooksOpen(dep: unknown): boolean {
  if (!dep || typeof dep !== "object") return true;
  const record = dep as Record<string, unknown>;
  if (record.status === "closed" || record.closed_at != null) return false;
  const issue = record.issue;
  if (issue && typeof issue === "object") {
    const nested = issue as Record<string, unknown>;
    if (nested.status === "closed" || nested.closed_at != null) return false;
  }
  return true;
}

export function deriveWorkflow(policy: LabelPolicy, requestedState?: string): Workflow {
  const groups = policy.policy?.groups ?? [];
  const labels = groups.flatMap((group) => group.labels ?? []);
  const stateGroup = groups.find(
    (group) =>
      group.name === "state" ||
      group.labels?.includes("ready-for-agent") ||
      group.labels?.includes("in-review"),
  );
  const stateLabels = stateGroup?.labels ?? labels;
  return {
    readyLabel:
      requestedState || (stateLabels.includes("ready-for-agent") ? "ready-for-agent" : undefined),
    reviewLabel: stateLabels.includes("in-review") ? "in-review" : undefined,
    stateLabels,
    strictLabels: policy.policy?.strict ?? false,
  };
}

function deriveArea(issue: PebIssue): string {
  const labels = issue.labels ?? [];
  const nonState = labels.find(
    (label) =>
      ![
        "bug",
        "enhancement",
        "ready-for-agent",
        "ready-for-human",
        "in-review",
        "needs-triage",
        "needs-info",
        "wontfix",
      ].includes(label),
  );
  if (nonState) return nonState;
  const text = `${issue.title} ${issue.description ?? ""}`.toLowerCase();
  for (const candidate of [
    "auth",
    "ui",
    "api",
    "docs",
    "documentation",
    "hook",
    "dep",
    "dependency",
    "lsp",
    "mcp",
    "pi",
    "git",
    "pebble",
    "test",
  ]) {
    if (text.includes(candidate)) return candidate;
  }
  return "general";
}

function deriveRisk(issue: PebIssue): "low" | "medium" | "high" {
  const text = `${issue.title}\n${issue.description ?? ""}`;
  if (
    (issue.priority ?? 2) <= 0 ||
    text.length > 4000 ||
    /migration|delete|security|auth|payment|database/i.test(text)
  )
    return "high";
  if ((issue.priority ?? 2) <= 1 || text.length > 1500 || /refactor|workflow|orchestr/i.test(text))
    return "medium";
  return "low";
}

export function formatPlan(plan: Plan): string {
  const lines = [
    `Pebble plan for ${plan.repo}`,
    `Run: ${plan.runId}`,
    `Base: ${plan.baseRef}`,
    `Pickup state: ${plan.workflow.readyLabel ?? "open issues (no state label)"}`,
    `Concurrency: ${plan.concurrency}`,
    "",
  ];

  if (plan.items.length === 0) {
    lines.push("No ready/open pebbles found.");
    return lines.join("\n");
  }

  lines.push("Selected batch:");
  if (plan.selected.length === 0) {
    lines.push("- none");
  } else {
    for (const item of plan.selected) {
      lines.push(`- ${item.issue.id} — ${item.issue.title}`);
      lines.push(`  branch: ${item.branch}`);
      lines.push(`  worktree: ${item.worktreePath}`);
      lines.push(`  area: ${item.area}; risk: ${item.risk}`);
    }
  }

  const deferred = plan.items.filter((item) => !plan.selected.includes(item));
  if (deferred.length > 0) {
    lines.push("", "Deferred / skipped:");
    for (const item of deferred) {
      const reason =
        item.blockingReasons.length > 0 ? item.blockingReasons.join("; ") : "not in selected batch";
      lines.push(`- ${item.issue.id} — ${item.issue.title} (${reason})`);
    }
  }

  return lines.join("\n");
}

function branchFor(issue: PebIssue): string {
  return `agent/${issue.id}-${slugify(issue.title)}`;
}

function branchMatchesIssue(branch: string, issueId: string): boolean {
  return (
    branch === issueId ||
    branch.endsWith(`/${issueId}`) ||
    branch.includes(`/${issueId}-`) ||
    branch.includes(`/${issueId}_`)
  );
}

function worktreeFor(gitRoot: string, issue: PebIssue): string {
  return join(
    dirname(gitRoot),
    ".worktrees",
    `${basename(gitRoot)}-${issue.id}-${slugify(issue.title)}`,
  );
}

function readinessGaps(issue: PebIssue): string[] {
  const gaps: string[] = [];
  const description = issue.description?.trim() ?? "";
  const combined = `${issue.title}\n${description}`;
  if (description.length < 160) gaps.push("description is too short for confident AFK work");
  if (!/acceptance|done|success|expected|should|must/i.test(combined))
    gaps.push("missing clear acceptance criteria / definition of done");
  if (!/test|verify|check|validation|smoke/i.test(combined))
    gaps.push("missing verification expectation");
  if (!/scope|non-goal|boundary|limit|only|avoid/i.test(combined))
    gaps.push("missing scope boundaries or non-goals");
  return gaps;
}

export function formatTriageQueue(issues: PebIssue[]): string {
  if (issues.length === 0) return "No pebbles need triage.";
  const lines = ["Pebbles needing triage:", ""];
  for (const issue of issues) {
    const gaps = readinessGaps(issue);
    lines.push(`- ${issue.id} — ${issue.title}`);
    lines.push(
      `  status: ${issue.status ?? "unknown"}; labels: ${(issue.labels ?? []).join(", ") || "none"}`,
    );
    if (gaps.length > 0) lines.push(`  gaps: ${gaps.join("; ")}`);
  }
  return lines.join("\n");
}

export function createPlanning(ops: PebOps, show: Show) {
  const { checked, detect, loadPolicy, listOpenPrs, listBranches, currentBaseRef, showIssue } = ops;

  async function createPlan(options: {
    repo?: string;
    cwd: string;
    concurrency?: number;
    state?: string;
  }): Promise<Plan> {
    const { repo, gitRoot } = await detect(options.repo, options.cwd);
    const policy = await loadPolicy(repo);
    const workflow = deriveWorkflow(policy, options.state);
    const args = workflow.readyLabel
      ? ["list", "--label", workflow.readyLabel, "--json"]
      : ["list", "--status", "open", "--json"];
    const issues = jsonData<PebIssue[]>((await checked("peb", args, repo)).stdout);
    const [openPrs, branches, baseRef] = await Promise.all([
      listOpenPrs(gitRoot),
      listBranches(gitRoot),
      currentBaseRef(gitRoot),
    ]);
    const openPrBranches = new Set(
      openPrs
        .map((pr) => pr.headRefName)
        .filter((value): value is string => typeof value === "string"),
    );
    const branchSet = new Set(branches);
    const runId = `peb-${new Date().toISOString().replace(/[:.]/g, "-")}`;

    const items: PlanItem[] = [];
    for (const listed of issues) {
      if (!listed.id) continue;
      const issue = await showIssue(repo, listed.id);
      if (isClosed(issue)) continue;
      const branch = branchFor(issue);
      const sandcastleBranch = `sandcastle/${issue.id}-${slugify(issue.title)}`;
      const blockingReasons: string[] = [];
      const existingPr = openPrs.find(
        (pr) =>
          pr.headRefName === branch ||
          pr.headRefName === sandcastleBranch ||
          pr.headRefName?.includes(issue.id),
      );
      const existingBranch = [
        branch,
        sandcastleBranch,
        ...branches.filter((candidate) => branchMatchesIssue(candidate, issue.id)),
      ].find((candidate) => branchSet.has(candidate));
      if (existingPr)
        blockingReasons.push(
          `open PR ${existingPr.number ?? existingPr.url ?? existingPr.headRefName}`,
        );
      else if (openPrBranches.has(branch) || openPrBranches.has(sandcastleBranch))
        blockingReasons.push("open PR for orchestrator branch");
      const openDeps = (issue.dependencies ?? [])
        .filter(dependencyLooksOpen)
        .map(getDependencyId)
        .filter(Boolean);
      if (openDeps.length > 0) blockingReasons.push(`blocked by ${openDeps.join(", ")}`);
      const actualBranch = existingBranch ?? branch;

      items.push({
        issue,
        branch: actualBranch,
        worktreePath: worktreeFor(gitRoot, issue),
        area: deriveArea(issue),
        risk: deriveRisk(issue),
        selectable: blockingReasons.length === 0,
        blockingReasons,
        existingPr,
        existingBranch,
      });
    }

    const selected: PlanItem[] = [];
    const usedAreas = new Set<string>();
    for (const item of items) {
      if (selected.length >= (options.concurrency ?? DEFAULT_CONCURRENCY)) break;
      if (!item.selectable) continue;
      if (usedAreas.has(item.area) && item.area !== "general") {
        item.blockingReasons.push(`parallel overlap risk in area ${item.area}`);
        item.selectable = false;
        continue;
      }
      usedAreas.add(item.area);
      selected.push(item);
    }

    return {
      repo,
      gitRoot,
      runId,
      workflow,
      concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
      baseRef,
      items,
      selected,
      openPrs,
    };
  }

  async function listTriageIssues(repo: string, workflow: Workflow): Promise<PebIssue[]> {
    const stateLabels = workflow.stateLabels.filter((label) =>
      ["needs-triage", "needs-info"].includes(label),
    );
    const seen = new Set<string>();
    const issues: PebIssue[] = [];
    const listArgs =
      stateLabels.length > 0
        ? stateLabels.map((label) => ["list", "--label", label, "--json"])
        : [["list", "--status", "open", "--json"]];

    const addCandidates = async (args: string[]) => {
      const listed = jsonData<PebIssue[]>((await checked("peb", args, repo)).stdout);
      for (const candidate of listed) {
        if (!candidate.id || seen.has(candidate.id)) continue;
        const issue = await showIssue(repo, candidate.id);
        if (isClosed(issue) || isInProgress(issue)) continue;
        const labels = issue.labels ?? [];
        if (labels.includes(workflow.readyLabel ?? "ready-for-agent")) continue;
        if (workflow.reviewLabel && labels.includes(workflow.reviewLabel)) continue;
        if (labels.includes("wontfix")) continue;
        seen.add(issue.id);
        issues.push(issue);
      }
    };

    for (const args of listArgs) await addCandidates(args);
    await addCandidates(["list", "--json"]);

    return issues.sort((left, right) => (left.priority ?? 2) - (right.priority ?? 2));
  }

  async function transitionStateLabel(
    repo: string,
    issue: PebIssue,
    workflow: Workflow,
    targetLabel: string,
    dryRun: boolean,
  ): Promise<string> {
    const labels = issue.labels ?? [];
    const args = ["update", issue.id, "--status", "open"];
    for (const label of labels) {
      if (workflow.stateLabels.includes(label) && label !== targetLabel)
        args.push("--remove-label", label);
    }
    if (!labels.includes(targetLabel)) args.push("--add-label", targetLabel);
    if (dryRun) return `Dry run: peb ${args.join(" ")}`;
    await checked("peb", args, repo);
    return `${issue.id} moved to ${targetLabel}.`;
  }

  async function runInteractiveTriage(
    ctx: PebblesCommandContext,
    options: { repo?: string; dryRun: boolean },
  ): Promise<void> {
    const { repo } = await detect(options.repo, ctx.cwd);
    const workflow = deriveWorkflow(await loadPolicy(repo));
    const issues = await listTriageIssues(repo, workflow);
    if (!ctx.hasUI) {
      show(formatTriageQueue(issues), { repo, issues });
      return;
    }
    if (issues.length === 0) {
      ctx.ui.notify("No Pebbles triage candidates found.", "info");
      return;
    }

    let remaining = issues;
    while (remaining.length > 0) {
      const choice = await ctx.ui.select("Pebbles triage queue", [
        ...remaining.map((issue) => {
          const gaps = readinessGaps(issue).length;
          return `${issue.id} — ${issue.title}${gaps > 0 ? ` (${gaps} readiness gap${gaps === 1 ? "" : "s"})` : ""}`;
        }),
        "Stop triage",
      ]);
      if (!choice || choice === "Stop triage") return;
      const id = choice.split(" ")[0];
      if (!id) return;
      const issue = await showIssue(repo, id);
      const gaps = readinessGaps(issue);
      show(
        [
          `Triage: ${issue.id} — ${issue.title}`,
          "",
          issue.description?.trim() || "(no description)",
          "",
          gaps.length > 0
            ? `Readiness gaps:\n- ${gaps.join("\n- ")}`
            : "No obvious readiness gaps.",
        ].join("\n"),
        issue,
      );

      const stateChoices = ["ready-for-agent", "needs-info", "ready-for-human", "wontfix"].filter(
        (label) => workflow.stateLabels.length === 0 || workflow.stateLabels.includes(label),
      );
      const action = await ctx.ui.select(`Triage ${issue.id}`, [
        "Edit description",
        "Add milestone comment",
        ...stateChoices.map((label) => `Move to ${label}`),
        "Skip",
        "Stop triage",
      ]);
      if (!action || action === "Stop triage") return;
      if (action === "Skip") {
        remaining = remaining.filter((candidate) => candidate.id !== issue.id);
        continue;
      }
      if (action === "Edit description") {
        const nextDescription = await ctx.ui.editor(
          `Edit description for ${issue.id}`,
          issue.description ?? "",
        );
        if (nextDescription == null) continue;
        if (options.dryRun) show(`Dry run: would update description for ${issue.id}.`);
        else await checked("peb", ["update", issue.id, "--description", nextDescription], repo);
        remaining = remaining.filter((candidate) => candidate.id !== issue.id);
        continue;
      }
      if (action === "Add milestone comment") {
        const body = await ctx.ui.editor(`Comment for ${issue.id}`, "");
        if (!body?.trim()) continue;
        if (options.dryRun) show(`Dry run: would add comment to ${issue.id}:\n\n${body.trim()}`);
        else await checked("peb", ["comment", "add", issue.id, body.trim()], repo);
        continue;
      }
      if (action.startsWith("Move to ")) {
        const target = action.slice("Move to ".length);
        if (target === "ready-for-agent" && gaps.length > 0) {
          const confirmed = await ctx.ui.confirm(
            "Mark ready despite gaps?",
            `${issue.id} still has readiness gaps:\n\n- ${gaps.join("\n- ")}\n\nContinue?`,
          );
          if (!confirmed) continue;
        }
        const message = await transitionStateLabel(repo, issue, workflow, target, options.dryRun);
        show(message, { repo, issue: issue.id, target, dryRun: options.dryRun });
        remaining = remaining.filter((candidate) => candidate.id !== issue.id);
      }
    }
  }

  return { createPlan, listTriageIssues, runInteractiveTriage };
}
