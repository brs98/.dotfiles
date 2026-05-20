import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateTail, withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";

type ExecResult = { stdout: string; stderr: string; code: number | null; killed?: boolean };
type PebEnvelope<T> = { data: T; schema_version?: number };
type LabelPolicy = { policy?: { groups?: Array<{ name?: string; labels?: string[]; cardinality?: string }>; strict?: boolean; version?: number } };
type PebIssue = {
  id: string;
  title: string;
  description?: string;
  issue_type?: string;
  priority?: number;
  status?: string;
  labels?: string[];
  dependencies?: unknown[];
  dependents?: unknown[];
  comments?: Array<{ id?: string; body?: string }>;
  closed_at?: string | null;
  [key: string]: unknown;
};
type OpenPr = { number?: number; headRefName?: string; url?: string };
type Workflow = {
  readyLabel?: string;
  reviewLabel?: string;
  stateLabels: string[];
  strictLabels: boolean;
};
type PlanItem = {
  issue: PebIssue;
  branch: string;
  worktreePath: string;
  area: string;
  risk: "low" | "medium" | "high";
  selectable: boolean;
  blockingReasons: string[];
  existingPr?: OpenPr;
  existingBranch?: string;
};
type Plan = {
  repo: string;
  gitRoot: string;
  runId: string;
  workflow: Workflow;
  concurrency: number;
  baseRef: string;
  items: PlanItem[];
  selected: PlanItem[];
  openPrs: OpenPr[];
};
type AgentRun = {
  issueId: string;
  role: "implementer" | "reviewer";
  cwd: string;
  model: string;
  exitCode: number | null;
  durationMs: number;
  finalOutput: string;
  stderr: string;
  truncated?: boolean;
  fullOutputPath?: string;
};
type RunResult = {
  item: PlanItem;
  worktreePath: string;
  implementer?: AgentRun;
  reviewer?: AgentRun;
  approved: boolean;
  pr?: OpenPr;
  errors: string[];
};

const DEFAULT_MODEL = "vercel-ai-gateway/moonshotai/kimi-k2.6";
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;
const KILL_GRACE_MS = 5_000;
const COMMAND_TIMEOUT_MS = 120_000;

const PebPlanParams = Type.Object({
  repo: Type.Optional(Type.String({ description: "Pebbles workspace or path inside it. Defaults to current cwd." })),
  concurrency: Type.Optional(Type.Number({ description: `Maximum parallel ready pebbles to select. Default: ${DEFAULT_CONCURRENCY}.` })),
  state: Type.Optional(Type.String({ description: "Pickup label. Defaults to ready-for-agent when present, otherwise all open issues." })),
});

const PebSyncParams = Type.Object({
  repo: Type.Optional(Type.String({ description: "Pebbles workspace or path inside it. Defaults to current cwd." })),
  dryRun: Type.Optional(Type.Boolean({ description: "Report what would sync without mutating Pebbles." })),
});

function parseArgs(input: string): { positionals: string[]; flags: Record<string, string | boolean> } {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (const char of input.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);

  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? "";
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const eq = token.indexOf("=");
    if (eq > 2) {
      flags[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const key = token.slice(2);
    const next = tokens[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { positionals, flags };
}

function asNumber(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "work";
}

function jsonData<T>(raw: string): T {
  const parsed = JSON.parse(raw) as PebEnvelope<T>;
  return parsed.data;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isClosed(issue: PebIssue): boolean {
  return issue.status === "closed" || issue.closed_at != null;
}

function getDependencyId(dep: unknown): string | undefined {
  if (!dep || typeof dep !== "object") return undefined;
  const record = dep as Record<string, unknown>;
  for (const key of ["parent_id", "depends_on_id", "dependency_id", "target_id", "id", "issue_id"]) {
    if (typeof record[key] === "string") return record[key] as string;
  }
  const issue = record.issue;
  if (issue && typeof issue === "object" && typeof (issue as Record<string, unknown>).id === "string") {
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

function deriveWorkflow(policy: LabelPolicy, requestedState?: string): Workflow {
  const groups = policy.policy?.groups ?? [];
  const labels = groups.flatMap((group) => group.labels ?? []);
  const stateGroup = groups.find((group) => group.name === "state" || group.labels?.includes("ready-for-agent") || group.labels?.includes("in-review"));
  const stateLabels = stateGroup?.labels ?? labels;
  return {
    readyLabel: requestedState || (stateLabels.includes("ready-for-agent") ? "ready-for-agent" : undefined),
    reviewLabel: stateLabels.includes("in-review") ? "in-review" : undefined,
    stateLabels,
    strictLabels: policy.policy?.strict ?? false,
  };
}

function deriveArea(issue: PebIssue): string {
  const labels = issue.labels ?? [];
  const nonState = labels.find((label) => !["ready-for-agent", "ready-for-human", "in-review", "needs-triage", "needs-info", "wontfix"].includes(label));
  if (nonState) return nonState;
  const text = `${issue.title} ${issue.description ?? ""}`.toLowerCase();
  for (const candidate of ["auth", "ui", "api", "docs", "test", "lsp", "mcp", "pi", "git", "pebble"]) {
    if (text.includes(candidate)) return candidate;
  }
  return "general";
}

function deriveRisk(issue: PebIssue): "low" | "medium" | "high" {
  const text = `${issue.title}\n${issue.description ?? ""}`;
  if ((issue.priority ?? 2) <= 0 || text.length > 4000 || /migration|delete|security|auth|payment|database/i.test(text)) return "high";
  if ((issue.priority ?? 2) <= 1 || text.length > 1500 || /refactor|workflow|orchestr/i.test(text)) return "medium";
  return "low";
}

function formatPlan(plan: Plan): string {
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
      const reason = item.blockingReasons.length > 0 ? item.blockingReasons.join("; ") : "not in selected batch";
      lines.push(`- ${item.issue.id} — ${item.issue.title} (${reason})`);
    }
  }

  return lines.join("\n");
}

function formatRunResults(results: RunResult[]): string {
  if (results.length === 0) return "No pebbles were run.";
  const lines = ["Pebble run results:", ""];
  for (const result of results) {
    const id = result.item.issue.id;
    const icon = result.approved && result.errors.length === 0 ? "✓" : "✗";
    lines.push(`${icon} ${id} — ${result.item.issue.title}`);
    lines.push(`  branch: ${result.item.branch}`);
    lines.push(`  worktree: ${result.worktreePath}`);
    if (result.implementer) lines.push(`  implementer: exit ${result.implementer.exitCode}, ${(result.implementer.durationMs / 1000).toFixed(1)}s`);
    if (result.reviewer) lines.push(`  reviewer: exit ${result.reviewer.exitCode}, ${(result.reviewer.durationMs / 1000).toFixed(1)}s${result.approved ? ", APPROVED" : ""}`);
    if (result.pr?.url) lines.push(`  PR: ${result.pr.url}`);
    if (result.errors.length > 0) lines.push(`  errors: ${result.errors.join("; ")}`);
  }
  return lines.join("\n");
}

async function limitMap<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

async function maybeTruncateRun(run: AgentRun): Promise<string> {
  const combined = run.finalOutput || run.stderr || "(no output)";
  const truncation = truncateTail(combined, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
  if (!truncation.truncated) return truncation.content;
  const path = join(run.cwd, `.pi-${run.role}-${run.issueId}-output.txt`);
  await withFileMutationQueue(path, async () => writeFile(path, combined, "utf8"));
  run.truncated = true;
  run.fullOutputPath = path;
  run.finalOutput = truncation.content;
  return `${truncation.content}\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(
    truncation.outputBytes,
  )} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${path}]`;
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  if (currentScript && !currentScript.startsWith("/$bunfs/root/") && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }
  const execName = basename(process.execPath).toLowerCase();
  if (!/^(node|bun)(\.exe)?$/.test(execName)) return { command: process.execPath, args };
  return { command: "pi", args };
}

function buildAgentArgs(task: string, model: string, tools: string[]): string[] {
  return ["--mode", "json", "--no-session", "--model", model, "--tools", tools.join(","), "-p", task];
}

async function runPiAgent(params: {
  issueId: string;
  role: "implementer" | "reviewer";
  cwd: string;
  model: string;
  tools: string[];
  task: string;
  timeoutMs: number;
}): Promise<AgentRun> {
  const startedAt = Date.now();
  const run: AgentRun = {
    issueId: params.issueId,
    role: params.role,
    cwd: params.cwd,
    model: params.model,
    exitCode: null,
    durationMs: 0,
    finalOutput: "",
    stderr: "",
  };
  const invocation = getPiInvocation(buildAgentArgs(params.task, params.model, params.tools));

  await new Promise<void>((resolvePromise) => {
    const proc = spawn(invocation.command, invocation.args, { cwd: params.cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdoutBuffer = "";
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      run.exitCode = code;
      run.durationMs = Date.now() - startedAt;
      resolvePromise();
    };
    const kill = (reason: string) => {
      if (settled) return;
      run.stderr += run.stderr ? `\n${reason}` : reason;
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) proc.kill("SIGKILL");
      }, KILL_GRACE_MS);
    };
    const timeoutTimer = setTimeout(() => kill(`${params.role} timed out after ${params.timeoutMs}ms.`), params.timeoutMs);
    const processLine = (line: string) => {
      if (!line.trim()) return;
      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (!event || typeof event !== "object") return;
      const candidate = event as { type?: unknown; message?: unknown };
      if (candidate.type !== "message_end" || !candidate.message || typeof candidate.message !== "object") return;
      const message = candidate.message as { role?: string; content?: Array<{ type?: string; text?: string }> };
      if (message.role !== "assistant") return;
      const text = (message.content ?? [])
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n");
      if (text) run.finalOutput = text;
    };
    proc.stdout.on("data", (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });
    proc.stderr.on("data", (data) => {
      run.stderr += data.toString();
    });
    proc.on("error", (error) => {
      run.stderr += run.stderr ? `\n${error.message}` : error.message;
      finish(1);
    });
    proc.on("close", (code) => {
      if (stdoutBuffer.trim()) processLine(stdoutBuffer);
      finish(code ?? 0);
    });
  });
  await maybeTruncateRun(run);
  return run;
}

export default function pebbleOrchestrator(pi: ExtensionAPI) {
  async function exec(command: string, args: string[], cwd: string, timeout = COMMAND_TIMEOUT_MS): Promise<ExecResult> {
    const result = (await pi.exec(command, args, { cwd, timeout })) as ExecResult;
    return result;
  }

  async function checked(command: string, args: string[], cwd: string, timeout = COMMAND_TIMEOUT_MS): Promise<ExecResult> {
    const result = await exec(command, args, cwd, timeout);
    if (result.code !== 0) {
      const rendered = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
      throw new Error(`${command} ${args.join(" ")} failed${rendered ? `:\n${rendered}` : ""}`);
    }
    return result;
  }

  async function detect(repoArg: string | undefined, cwd: string): Promise<{ repo: string; gitRoot: string }> {
    const start = repoArg ? resolve(cwd, repoArg) : cwd;
    const where = await checked("peb", ["where"], start);
    const repo = where.stdout.trim();
    if (!repo) throw new Error("peb where returned no workspace path.");
    const gitRoot = (await checked("git", ["rev-parse", "--show-toplevel"], repo)).stdout.trim();
    return { repo, gitRoot };
  }

  async function loadPolicy(repo: string): Promise<LabelPolicy> {
    const result = await exec("peb", ["config", "label-policy", "show", "--json"], repo);
    if (result.code !== 0) return {};
    return jsonData<LabelPolicy>(result.stdout);
  }

  async function listOpenPrs(repo: string): Promise<OpenPr[]> {
    try {
      const result = await exec("gh", ["pr", "list", "--state", "open", "--json", "number,headRefName,url"], repo, 30_000);
      if (result.code !== 0) return [];
      return JSON.parse(result.stdout) as OpenPr[];
    } catch {
      return [];
    }
  }

  async function listBranches(gitRoot: string): Promise<string[]> {
    const result = await checked("git", ["for-each-ref", "--format=%(refname:short)", "refs/heads"], gitRoot);
    return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  }

  async function currentBaseRef(gitRoot: string): Promise<string> {
    const result = await exec("git", ["branch", "--show-current"], gitRoot);
    const branch = result.stdout.trim();
    return branch || "HEAD";
  }

  async function showIssue(repo: string, id: string): Promise<PebIssue> {
    const result = await checked("peb", ["show", id, "--json"], repo);
    return jsonData<PebIssue>(result.stdout);
  }

  function branchFor(issue: PebIssue): string {
    return `agent/${issue.id}-${slugify(issue.title)}`;
  }

  function worktreeFor(gitRoot: string, issue: PebIssue): string {
    return join(dirname(gitRoot), ".worktrees", `${basename(gitRoot)}-${issue.id}-${slugify(issue.title)}`);
  }

  async function createPlan(options: { repo?: string; cwd: string; concurrency?: number; state?: string }): Promise<Plan> {
    const { repo, gitRoot } = await detect(options.repo, options.cwd);
    const policy = await loadPolicy(repo);
    const workflow = deriveWorkflow(policy, options.state);
    const args = ["list", "--status", "open", "--json"];
    if (workflow.readyLabel) args.splice(1, 0, "--label", workflow.readyLabel);
    const issues = jsonData<PebIssue[]>((await checked("peb", args, repo)).stdout);
    const [openPrs, branches, baseRef] = await Promise.all([listOpenPrs(gitRoot), listBranches(gitRoot), currentBaseRef(gitRoot)]);
    const openPrBranches = new Set(openPrs.map((pr) => pr.headRefName).filter((value): value is string => typeof value === "string"));
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
      const existingPr = openPrs.find((pr) => pr.headRefName === branch || pr.headRefName === sandcastleBranch || pr.headRefName?.includes(issue.id));
      const existingBranch = [branch, sandcastleBranch, ...branches.filter((candidate) => candidate.includes(issue.id))].find((candidate) => branchSet.has(candidate));
      if (existingPr) blockingReasons.push(`open PR ${existingPr.number ?? existingPr.url ?? existingPr.headRefName}`);
      else if (openPrBranches.has(branch) || openPrBranches.has(sandcastleBranch)) blockingReasons.push("open PR for orchestrator branch");
      if (existingBranch && !existingPr) blockingReasons.push(`existing branch ${existingBranch}`);
      const openDeps = (issue.dependencies ?? []).filter(dependencyLooksOpen).map(getDependencyId).filter(Boolean);
      if (openDeps.length > 0) blockingReasons.push(`blocked by ${openDeps.join(", ")}`);

      items.push({
        issue,
        branch,
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

    return { repo, gitRoot, runId, workflow, concurrency: options.concurrency ?? DEFAULT_CONCURRENCY, baseRef, items, selected, openPrs };
  }

  async function existingWorktrees(gitRoot: string): Promise<Map<string, string>> {
    const output = (await checked("git", ["worktree", "list", "--porcelain"], gitRoot)).stdout;
    const map = new Map<string, string>();
    let currentPath: string | undefined;
    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) currentPath = line.slice("worktree ".length);
      if (line.startsWith("branch refs/heads/") && currentPath) map.set(line.slice("branch refs/heads/".length), currentPath);
    }
    return map;
  }

  async function branchExists(gitRoot: string, branch: string): Promise<boolean> {
    const result = await exec("git", ["show-ref", "--verify", `refs/heads/${branch}`], gitRoot);
    return result.code === 0;
  }

  async function ensureWorktree(plan: Plan, item: PlanItem): Promise<string> {
    const worktrees = await existingWorktrees(plan.gitRoot);
    const existing = worktrees.get(item.branch) ?? (item.existingBranch ? worktrees.get(item.existingBranch) : undefined);
    if (existing) return existing;
    await mkdir(dirname(item.worktreePath), { recursive: true });
    if (await branchExists(plan.gitRoot, item.branch)) {
      await checked("git", ["worktree", "add", item.worktreePath, item.branch], plan.gitRoot, 120_000);
    } else {
      await checked("git", ["worktree", "add", "-b", item.branch, item.worktreePath, plan.baseRef], plan.gitRoot, 120_000);
    }
    return item.worktreePath;
  }

  async function commentOnce(repo: string, issue: PebIssue, marker: string, body: string): Promise<void> {
    const latest = await showIssue(repo, issue.id);
    const exists = (latest.comments ?? []).some((comment) => comment.body?.includes(marker));
    if (exists) return;
    await checked("peb", ["comment", "add", issue.id, body], repo);
  }

  async function dispatch(plan: Plan, model: string): Promise<Array<{ item: PlanItem; worktreePath: string }>> {
    const dispatched: Array<{ item: PlanItem; worktreePath: string }> = [];
    pi.appendEntry("pebble-orchestrator-run", { runId: plan.runId, repo: plan.repo, model, selected: plan.selected.map((item) => item.issue.id) });
    for (const item of plan.selected) {
      const worktreePath = await ensureWorktree(plan, item);
      await checked("peb", ["update", item.issue.id, "--status", "in_progress"], plan.repo);
      const marker = `pebble-orchestrator: branch ${item.branch}`;
      await commentOnce(
        plan.repo,
        item.issue,
        marker,
        [
          marker,
          `Run: ${plan.runId}`,
          `Worktree: ${worktreePath}`,
          `Model: ${model}`,
          `Base: ${plan.baseRef}`,
        ].join("\n"),
      );
      dispatched.push({ item, worktreePath });
    }
    return dispatched;
  }

  function implementerPrompt(plan: Plan, item: PlanItem, worktreePath: string, model: string): string {
    return [
      "You are a Pi implementer subagent working on exactly one Pebbles issue.",
      "Keep scope limited to this pebble. Do not work on unrelated issues. Do not spawn nested subagents.",
      "Use the worktree as the code workspace and the Pebbles repo as the issue workspace.",
      "",
      `Pebbles workspace: ${plan.repo}`,
      `Code worktree: ${worktreePath}`,
      `Issue: ${item.issue.id} — ${item.issue.title}`,
      `Branch: ${item.branch}`,
      `Model: ${model}`,
      "",
      "Required workflow:",
      `1. Run: cd ${JSON.stringify(plan.repo)} && peb show ${item.issue.id} --json`,
      "2. Inspect relevant files/tests and project instructions (AGENTS.md, README, package scripts).",
      "3. Implement the smallest safe vertical slice for this pebble in the code worktree.",
      "4. Add/update tests or smoke checks where appropriate.",
      "5. Run repo-specific checks you can reasonably run.",
      `6. Commit changes on ${item.branch} with a conventional commit and a commit body trailer: Closes: ${item.issue.id}`,
      "7. If you discover follow-up work, mention it in your final report; do not invent ad hoc TODOs in code.",
      "",
      "Final response: summarize changes, checks run, commit SHA, and any risks/follow-ups.",
    ].join("\n");
  }

  function reviewerPrompt(plan: Plan, item: PlanItem, worktreePath: string): string {
    return [
      "You are a read-only Pi reviewer subagent.",
      "Do not edit files, commit, push, or mutate Pebbles. Review only.",
      "",
      `Pebbles workspace: ${plan.repo}`,
      `Code worktree: ${worktreePath}`,
      `Issue: ${item.issue.id} — ${item.issue.title}`,
      `Branch: ${item.branch}`,
      `Base: ${plan.baseRef}`,
      "",
      "Required review:",
      `1. Run: cd ${JSON.stringify(plan.repo)} && peb show ${item.issue.id} --json`,
      `2. Inspect: cd ${JSON.stringify(worktreePath)} && git diff ${plan.baseRef}...HEAD --stat && git diff ${plan.baseRef}...HEAD`,
      "3. Verify scope, tests/checks, safety, and whether the implementation satisfies the pebble.",
      "",
      "Final response MUST start with exactly one of:",
      "APPROVED — if safe to open a PR.",
      "CHANGES_REQUESTED — if more implementation work is needed.",
      "Then provide concise reasons.",
    ].join("\n");
  }

  async function branchHasCommit(gitRoot: string, baseRef: string, branch: string): Promise<boolean> {
    const result = await exec("git", ["rev-list", "--count", `${baseRef}..${branch}`], gitRoot);
    return result.code === 0 && Number(result.stdout.trim()) > 0;
  }

  async function runImplementation(plan: Plan, item: PlanItem, worktreePath: string, model: string, timeoutMs: number): Promise<RunResult> {
    const result: RunResult = { item, worktreePath, approved: false, errors: [] };
    result.implementer = await runPiAgent({
      issueId: item.issue.id,
      role: "implementer",
      cwd: worktreePath,
      model,
      tools: ["read", "bash", "edit", "write", "find", "grep", "lsp_diagnostics"],
      task: implementerPrompt(plan, item, worktreePath, model),
      timeoutMs,
    });
    if (result.implementer.exitCode !== 0) result.errors.push(`implementer exited ${result.implementer.exitCode}`);
    if (!(await branchHasCommit(plan.gitRoot, plan.baseRef, item.branch))) result.errors.push("branch has no commits over base");
    if (result.errors.length > 0) {
      await checked("peb", ["comment", "add", item.issue.id, `pebble-orchestrator implementation did not complete in ${plan.runId}: ${result.errors.join("; ")}`], plan.repo).catch(() => undefined);
      return result;
    }

    result.reviewer = await runPiAgent({
      issueId: item.issue.id,
      role: "reviewer",
      cwd: worktreePath,
      model,
      tools: ["read", "bash", "find", "grep", "lsp_diagnostics"],
      task: reviewerPrompt(plan, item, worktreePath),
      timeoutMs,
    });
    if (result.reviewer.exitCode !== 0) result.errors.push(`reviewer exited ${result.reviewer.exitCode}`);
    if (!result.reviewer.finalOutput.trim().startsWith("APPROVED")) result.errors.push("reviewer did not approve");
    result.approved = result.errors.length === 0;
    if (!result.approved) {
      await checked(
        "peb",
        ["comment", "add", item.issue.id, `pebble-orchestrator review did not approve in ${plan.runId}: ${result.errors.join("; ")}\n\n${result.reviewer.finalOutput.slice(0, 4000)}`],
        plan.repo,
      ).catch(() => undefined);
    }
    return result;
  }

  async function findOpenPrForBranch(gitRoot: string, branch: string): Promise<OpenPr | undefined> {
    const prs = await listOpenPrs(gitRoot);
    return prs.find((pr) => pr.headRefName === branch);
  }

  async function openPr(plan: Plan, result: RunResult): Promise<void> {
    if (!result.approved) return;
    const branch = result.item.branch;
    const existing = await findOpenPrForBranch(plan.gitRoot, branch);
    if (existing) {
      result.pr = existing;
    } else {
      await checked("git", ["push", "-u", "origin", branch], result.worktreePath, 120_000);
      const title = `${result.item.issue.id}: ${result.item.issue.title}`;
      const body = [`Closes: ${result.item.issue.id}`, "", `Pebbles run: ${plan.runId}`].join("\n");
      const created = await checked("gh", ["pr", "create", "--base", plan.baseRef, "--head", branch, "--title", title, "--body", body], result.worktreePath, 120_000);
      const createdUrl = created.stdout.trim().split("\n").find((line) => /^https?:\/\//.test(line.trim()))?.trim();
      result.pr = (await findOpenPrForBranch(plan.gitRoot, branch)) ?? (createdUrl ? { headRefName: branch, url: createdUrl } : undefined);
    }
    const prRef = result.pr?.url ?? (result.pr?.number ? String(result.pr.number) : undefined);
    if (!prRef) throw new Error(`Could not determine PR reference for ${branch}; leaving labels unchanged.`);
    await checked("peb", ["closes", "add", result.item.issue.id, "--pr", prRef], plan.repo);
    if (plan.workflow.readyLabel && plan.workflow.reviewLabel) {
      await checked("peb", ["update", result.item.issue.id, "--remove-label", plan.workflow.readyLabel, "--add-label", plan.workflow.reviewLabel], plan.repo);
    }
  }

  async function runReady(options: {
    repo?: string;
    cwd: string;
    concurrency: number;
    state?: string;
    model: string;
    timeoutMs: number;
    createPrs: boolean;
    onProgress?: (message: string, details?: unknown) => void;
  }): Promise<{ plan: Plan; results: RunResult[] }> {
    const plan = await createPlan(options);
    if (plan.selected.length === 0) {
      options.onProgress?.(`${formatPlan(plan)}\n\nNo pebbles selected; nothing to dispatch.`, plan);
      return { plan, results: [] };
    }

    options.onProgress?.(`${formatPlan(plan)}\n\nDispatching selected pebbles to worktrees...`, plan);
    const dispatched = await dispatch(plan, options.model);

    options.onProgress?.(
      `Dispatched ${dispatched.length} pebble${dispatched.length === 1 ? "" : "s"}. Running implementer and reviewer subagents now...`,
      { plan, dispatched },
    );
    const results = await limitMap(dispatched, options.concurrency, async ({ item, worktreePath }) => runImplementation(plan, item, worktreePath, options.model, options.timeoutMs));
    if (options.createPrs) {
      options.onProgress?.("Implementation/review finished. Opening PRs for approved branches...", { plan, results });
      for (const result of results) {
        try {
          await openPr(plan, result);
        } catch (error) {
          result.errors.push(`PR creation failed: ${formatError(error)}`);
          result.approved = false;
          await checked("peb", ["comment", "add", result.item.issue.id, `pebble-orchestrator PR step failed in ${plan.runId}: ${formatError(error)}`], plan.repo).catch(() => undefined);
        }
      }
    }
    return { plan, results };
  }

  function show(content: string, details?: unknown): void {
    pi.sendMessage({ customType: "pebble-orchestrator", content, display: true, details });
  }

  function parseRunOptions(args: string, cwd: string): { repo?: string; cwd: string; concurrency: number; state?: string; model: string; timeoutMs: number } {
    const parsed = parseArgs(args);
    return {
      repo: parsed.positionals[0],
      cwd,
      concurrency: asNumber(parsed.flags.concurrency ?? parsed.flags.c, DEFAULT_CONCURRENCY),
      state: typeof parsed.flags.state === "string" ? parsed.flags.state : undefined,
      model: typeof parsed.flags.model === "string" ? parsed.flags.model : DEFAULT_MODEL,
      timeoutMs: asNumber(parsed.flags.timeoutMs ?? parsed.flags.timeout, DEFAULT_AGENT_TIMEOUT_MS),
    };
  }

  pi.registerCommand("peb-plan", {
    description: "Plan ready Pebbles work and show an unblocked parallel batch",
    handler: async (args, ctx) => {
      try {
        const options = parseRunOptions(args, ctx.cwd);
        const plan = await createPlan(options);
        show(formatPlan(plan), plan);
      } catch (error) {
        show(`peb-plan failed: ${formatError(error)}`);
      }
    },
  });

  pi.registerCommand("peb-run-ready", {
    description: "Dispatch ready pebbles to worktrees, implement, and review without opening PRs",
    handler: async (args, ctx) => {
      try {
        const options = parseRunOptions(args, ctx.cwd);
        show(`Starting /peb-run-ready for ${options.repo ?? ctx.cwd}. This may take several minutes while subagents work...`, options);
        const { plan, results } = await runReady({ ...options, createPrs: false, onProgress: show });
        show(`${formatPlan(plan)}\n\n${formatRunResults(results)}`, { plan, results });
      } catch (error) {
        show(`peb-run-ready failed: ${formatError(error)}`);
      }
    },
  });

  pi.registerCommand("peb-burn-down", {
    description: "Run a plan/implement/review/PR cycle for ready pebbles",
    handler: async (args, ctx) => {
      try {
        const options = parseRunOptions(args, ctx.cwd);
        show(`Starting /peb-burn-down for ${options.repo ?? ctx.cwd}. This may take several minutes while subagents work...`, options);
        const { plan, results } = await runReady({ ...options, createPrs: true, onProgress: show });
        show(`${formatPlan(plan)}\n\n${formatRunResults(results)}`, { plan, results });
      } catch (error) {
        show(`peb-burn-down failed: ${formatError(error)}`);
      }
    },
  });

  pi.registerCommand("peb-sync", {
    description: "Run peb sync github for a Pebbles workspace",
    handler: async (args, ctx) => {
      try {
        const parsed = parseArgs(args);
        const { repo } = await detect(parsed.positionals[0], ctx.cwd);
        const syncArgs = ["sync", "github"];
        if (parsed.flags["dry-run"] || parsed.flags.dryRun) syncArgs.push("--dry-run");
        const result = await checked("peb", syncArgs, repo, 120_000);
        show(result.stdout.trim() || "peb sync github completed.");
      } catch (error) {
        show(`peb-sync failed: ${formatError(error)}`);
      }
    },
  });

  pi.registerTool({
    name: "peb_plan",
    label: "Pebble Plan",
    description: "Inspect a Pebbles workspace and produce a ready/unblocked execution plan. Does not mutate Pebbles or git.",
    promptSnippet: "Plan ready Pebbles work without mutating the workspace.",
    promptGuidelines: ["Use peb_plan when the user asks what Pebbles work is ready or wants an execution plan."],
    parameters: PebPlanParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const plan = await createPlan({ repo: params.repo, cwd: ctx.cwd, concurrency: params.concurrency ?? DEFAULT_CONCURRENCY, state: params.state });
      return { content: [{ type: "text", text: formatPlan(plan) }], details: plan };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("peb_plan ")) + theme.fg("accent", args.repo ?? "cwd"), 0, 0);
    },
  });

  pi.registerTool({
    name: "peb_sync_github",
    label: "Pebble Sync",
    description: "Run peb sync github for a Pebbles workspace. Finalizes pending PR close declarations after merge.",
    promptSnippet: "Sync Pebbles PR close declarations from GitHub after PRs merge.",
    promptGuidelines: ["Use peb_sync_github only when the user asks to sync completed Pebbles PR closures."],
    parameters: PebSyncParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { repo } = await detect(params.repo, ctx.cwd);
      const args = ["sync", "github"];
      if (params.dryRun) args.push("--dry-run");
      const result = await checked("peb", args, repo, 120_000);
      return { content: [{ type: "text", text: result.stdout.trim() || "peb sync github completed." }], details: { repo, dryRun: params.dryRun ?? false } };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("peb_sync_github ")) + theme.fg("accent", args.repo ?? "cwd"), 0, 0);
    },
  });
}
