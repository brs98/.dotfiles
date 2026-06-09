import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getPiInvocation, getText } from "../lib/agent-process.js";
import { truncateToFile } from "../lib/output.js";
import type { PebOps } from "./peb.js";
import { formatPlan } from "./plan.js";
import {
  type AgentProgressEvent,
  type AgentRole,
  type AgentRun,
  formatError,
  type Plan,
  type PlanItem,
  type RunResult,
} from "./shared.js";

const KILL_GRACE_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function limitMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R | undefined>({ length: items.length });
  let next = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await fn(items[index] as T);
      }
    },
  );
  await Promise.all(workers);
  return results.map((result) => {
    if (result === undefined) throw new Error("limitMap worker did not produce a result");
    return result;
  });
}

async function maybeTruncateRun(run: AgentRun): Promise<string> {
  const combined = run.finalOutput || run.stderr || "(no output)";
  const result = await truncateToFile(combined, {
    direction: "tail",
    label: "Output",
    outputPath: () => join(run.cwd, `.pi-${run.role}-${run.issueId}-output.txt`),
  });
  if (!result.truncated) return result.text;
  run.truncated = true;
  run.fullOutputPath = result.fullOutputPath;
  run.finalOutput = result.content;
  return result.text;
}

function buildAgentArgs(task: string, model: string, tools: string[]): string[] {
  return [
    "--mode",
    "json",
    "--no-session",
    "--model",
    model,
    "--tools",
    tools.join(","),
    "-p",
    task,
  ];
}

async function runPiAgent(params: {
  issueId: string;
  role: AgentRole;
  cwd: string;
  model: string;
  tools: string[];
  task: string;
  timeoutMs: number;
  onEvent?: (event: AgentProgressEvent) => void;
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
  const emit = (phase: AgentProgressEvent["phase"], text: string) => {
    params.onEvent?.({
      issueId: params.issueId,
      role: params.role,
      phase,
      text,
      elapsedMs: Date.now() - startedAt,
    });
  };

  emit("started", `${params.role} started`);

  await new Promise<void>((resolvePromise) => {
    const proc = spawn(invocation.command, invocation.args, {
      cwd: params.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutBuffer = "";
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      run.exitCode = code;
      run.durationMs = Date.now() - startedAt;
      emit("finished", `${params.role} finished with exit ${code === null ? "unknown" : code}`);
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
    const timeoutTimer = setTimeout(
      () => kill(`${params.role} timed out after ${params.timeoutMs}ms.`),
      params.timeoutMs,
    );
    const processLine = (line: string) => {
      if (!line.trim()) return;
      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (!event || typeof event !== "object") return;
      const candidate = event as { type?: unknown; message?: unknown; toolName?: unknown };
      const eventType = typeof candidate.type === "string" ? candidate.type : undefined;
      const toolName = typeof candidate.toolName === "string" ? candidate.toolName : undefined;

      if (eventType === "tool_execution_start" && toolName)
        emit("tool_start", `${params.role}: ${toolName} started`);
      if (eventType === "tool_execution_update" && toolName)
        emit("tool_update", `${params.role}: ${toolName} running`);
      if (eventType === "tool_execution_end" && toolName)
        emit("tool_end", `${params.role}: ${toolName} finished`);

      if (
        candidate.type !== "message_end" ||
        !candidate.message ||
        typeof candidate.message !== "object"
      )
        return;
      const message = candidate.message as {
        role?: string;
        content?: Array<{ type?: string; text?: string }>;
      };
      if (message.role !== "assistant") return;
      const text = getText(message);
      if (text) {
        run.finalOutput = text;
        emit("assistant", text.trim().split("\n").find(Boolean) ?? `${params.role} responded`);
      }
    };
    proc.stdout.on("data", (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });
    proc.stderr.on("data", (data) => {
      const text = data.toString();
      run.stderr += text;
      emit("stderr", text.trim().split("\n").find(Boolean) ?? `${params.role} stderr`);
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

function plannerPrompt(plan: Plan, item: PlanItem, worktreePath: string): string {
  return [
    "You are a Pi planning subagent working on exactly one Pebbles issue.",
    "Do not edit files, commit, push, or mutate Pebbles. Plan only.",
    "Use fresh context to reduce implementation bias. Be concrete enough for a separate implementer subagent.",
    "",
    `Pebbles workspace: ${plan.repo}`,
    `Code worktree: ${worktreePath}`,
    `Issue: ${item.issue.id} — ${item.issue.title}`,
    `Branch: ${item.branch}`,
    `Base: ${plan.baseRef}`,
    "",
    "Required workflow:",
    `1. Run: cd ${JSON.stringify(plan.repo)} && peb show ${item.issue.id} --json`,
    "2. Inspect relevant files, docs, project instructions, and test/build scripts.",
    "3. Produce a concise implementation plan with scope boundaries, risks, files likely touched, and verification commands.",
    "4. Call out any ambiguity that should block implementation. If blocked, say BLOCKED and explain why.",
    "",
    "Final response: include Plan, Scope, Files, Verification, Risks, and Blockers sections.",
  ].join("\n");
}

function implementerPrompt(
  plan: Plan,
  item: PlanItem,
  worktreePath: string,
  model: string,
  attempt: number,
  plannerOutput?: string,
  reviewerFeedback?: string,
): string {
  const parts = [
    "You are a Pi implementer subagent working on exactly one Pebbles issue.",
    "Keep scope limited to this pebble. Do not work on unrelated issues. Do not spawn nested subagents.",
    "Use the worktree as the code workspace and the Pebbles repo as the issue workspace.",
    "",
    `Pebbles workspace: ${plan.repo}`,
    `Code worktree: ${worktreePath}`,
    `Issue: ${item.issue.id} — ${item.issue.title}`,
    `Branch: ${item.branch}`,
    `Model: ${model}`,
    `Attempt: ${attempt}`,
    "",
  ];

  if (plannerOutput?.trim()) {
    parts.push(
      "Planning subagent output to use as the implementation contract:",
      plannerOutput.trim(),
      "",
    );
  }

  if (reviewerFeedback?.trim()) {
    parts.push(
      "Reviewer feedback to address before the next review:",
      reviewerFeedback.trim(),
      "",
      "Address every substantive issue and nit from the reviewer. Keep existing good changes intact.",
      "If no code/doc changes are needed because the reviewer is mistaken, explain that clearly in your final response.",
      "",
    );
  }

  parts.push(
    "Required workflow:",
    `1. Run: cd ${JSON.stringify(plan.repo)} && peb show ${item.issue.id} --json`,
    "2. Inspect relevant files/tests and project instructions (AGENTS.md, README, package scripts).",
    "3. Use the planning subagent output as guidance, but verify assumptions independently.",
    "4. Implement the smallest safe vertical slice for this pebble, or address the reviewer feedback for this attempt.",
    "5. Add/update tests or smoke checks where appropriate.",
    "6. Run repo-specific checks you can reasonably run.",
    `7. Commit any changes on ${item.branch} with a conventional commit and a commit body trailer: Closes: ${item.issue.id}`,
    "8. If no changes were necessary, do not create an empty commit; explain why in the final response.",
    "9. If you discover follow-up work, mention it in your final report; do not invent ad hoc TODOs in code.",
    "",
    "Final response: summarize changes, checks run, commit SHA if any, and any risks/follow-ups.",
  );

  return parts.join("\n");
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
    "Final response MUST include exactly one verdict token:",
    "APPROVED — if safe to open a PR with no remaining issues or nits.",
    "CHANGES_REQUESTED — if more implementation work is needed.",
    "Then provide concise reasons and actionable feedback for the implementer when requesting changes.",
  ].join("\n");
}

function reviewVerdict(output: string): "approved" | "changes_requested" {
  if (/\bCHANGES_REQUESTED\b/i.test(output)) return "changes_requested";
  if (/\bAPPROVED\b/i.test(output)) return "approved";
  return "changes_requested";
}

export function formatRunResults(results: RunResult[]): string {
  if (results.length === 0) return "No pebbles were run.";
  const lines = ["Pebble run results:", ""];
  for (const result of results) {
    const id = result.item.issue.id;
    const icon = result.approved && result.errors.length === 0 ? "✓" : "✗";
    lines.push(`${icon} ${id} — ${result.item.issue.title}`);
    lines.push(`  branch: ${result.item.branch}`);
    lines.push(`  worktree: ${result.worktreePath}`);
    if (result.planner)
      lines.push(
        `  planner: exit ${result.planner.exitCode}, ${(result.planner.durationMs / 1000).toFixed(1)}s`,
      );
    if (result.implementer)
      lines.push(
        `  implementer: exit ${result.implementer.exitCode}, ${(result.implementer.durationMs / 1000).toFixed(1)}s`,
      );
    if (result.reviewer)
      lines.push(
        `  reviewer: exit ${result.reviewer.exitCode}, ${(result.reviewer.durationMs / 1000).toFixed(1)}s${result.approved ? ", APPROVED" : ""}`,
      );
    if (result.pr?.url) lines.push(`  PR: ${result.pr.url}`);
    if (result.errors.length > 0) lines.push(`  errors: ${result.errors.join("; ")}`);
  }
  return lines.join("\n");
}

export function createDispatcher(
  pi: ExtensionAPI,
  ops: PebOps,
  createPlan: (options: {
    repo?: string;
    cwd: string;
    concurrency?: number;
    state?: string;
  }) => Promise<Plan>,
) {
  const {
    checked,
    existingWorktrees,
    branchExists,
    branchHasCommit,
    commentOnce,
    findOpenPrForBranch,
  } = ops;

  async function ensureWorktree(plan: Plan, item: PlanItem): Promise<string> {
    const worktrees = await existingWorktrees(plan.gitRoot);
    const existing =
      worktrees.get(item.branch) ??
      (item.existingBranch ? worktrees.get(item.existingBranch) : undefined);
    if (existing) return existing;
    await mkdir(dirname(item.worktreePath), { recursive: true });
    if (await branchExists(plan.gitRoot, item.branch)) {
      await checked(
        "git",
        ["worktree", "add", item.worktreePath, item.branch],
        plan.gitRoot,
        120_000,
      );
    } else {
      await checked(
        "git",
        ["worktree", "add", "-b", item.branch, item.worktreePath, plan.baseRef],
        plan.gitRoot,
        120_000,
      );
    }
    return item.worktreePath;
  }

  async function dispatch(
    plan: Plan,
    model: string,
  ): Promise<Array<{ item: PlanItem; worktreePath: string }>> {
    const dispatched: Array<{ item: PlanItem; worktreePath: string }> = [];
    pi.appendEntry("pebble-orchestrator-run", {
      runId: plan.runId,
      repo: plan.repo,
      model,
      selected: plan.selected.map((item) => item.issue.id),
    });
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

  async function runImplementation(
    plan: Plan,
    item: PlanItem,
    worktreePath: string,
    model: string,
    timeoutMs: number,
    maxAttempts: number,
    callbacks?: {
      onItemStatus?: (item: PlanItem, status: string, details?: unknown) => void;
      onAgentEvent?: (event: AgentProgressEvent) => void;
    },
  ): Promise<RunResult> {
    const result: RunResult = { item, worktreePath, approved: false, errors: [] };
    callbacks?.onItemStatus?.(item, "planning", { worktreePath });
    result.planner = await runPiAgent({
      issueId: item.issue.id,
      role: "planner",
      cwd: worktreePath,
      model,
      tools: ["read", "bash", "find", "grep", "lsp_diagnostics"],
      task: plannerPrompt(plan, item, worktreePath),
      timeoutMs,
      onEvent: callbacks?.onAgentEvent,
    });
    if (result.planner.exitCode !== 0) {
      result.errors.push(`planner exited ${result.planner.exitCode}`);
      callbacks?.onItemStatus?.(item, "failed", { errors: result.errors });
      await checked(
        "peb",
        [
          "comment",
          "add",
          item.issue.id,
          `pebble-orchestrator planning did not complete in ${plan.runId}: ${result.errors.join("; ")}`,
        ],
        plan.repo,
      ).catch(() => undefined);
      return result;
    }
    if (/\bBLOCKED\b/i.test(result.planner.finalOutput)) {
      result.errors.push("planner reported BLOCKED");
      callbacks?.onItemStatus?.(item, "blocked", { errors: result.errors });
      await checked(
        "peb",
        [
          "comment",
          "add",
          item.issue.id,
          `pebble-orchestrator planning blocked implementation in ${plan.runId}:\n\n${result.planner.finalOutput.slice(0, 4000)}`,
        ],
        plan.repo,
      ).catch(() => undefined);
      return result;
    }

    let reviewerFeedback: string | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      result.errors = [];
      callbacks?.onItemStatus?.(item, "implementing", {
        worktreePath,
        attempt,
        maxAttempts,
        feedback: reviewerFeedback,
      });
      result.implementer = await runPiAgent({
        issueId: item.issue.id,
        role: "implementer",
        cwd: worktreePath,
        model,
        tools: ["read", "bash", "edit", "write", "find", "grep", "lsp_diagnostics"],
        task: implementerPrompt(
          plan,
          item,
          worktreePath,
          model,
          attempt,
          result.planner.finalOutput,
          reviewerFeedback,
        ),
        timeoutMs,
        onEvent: callbacks?.onAgentEvent,
      });

      if (result.implementer.exitCode !== 0)
        result.errors.push(`implementer exited ${result.implementer.exitCode}`);
      if (!(await branchHasCommit(plan.gitRoot, plan.baseRef, item.branch)))
        result.errors.push("branch has no commits over base");
      if (result.errors.length > 0) {
        callbacks?.onItemStatus?.(item, "failed", { errors: result.errors, attempt, maxAttempts });
        await checked(
          "peb",
          [
            "comment",
            "add",
            item.issue.id,
            `pebble-orchestrator implementation did not complete in ${plan.runId}: ${result.errors.join("; ")}`,
          ],
          plan.repo,
        ).catch(() => undefined);
        return result;
      }

      callbacks?.onItemStatus?.(item, "implemented", { worktreePath, attempt, maxAttempts });
      callbacks?.onItemStatus?.(item, "reviewing", { worktreePath, attempt, maxAttempts });
      result.reviewer = await runPiAgent({
        issueId: item.issue.id,
        role: "reviewer",
        cwd: worktreePath,
        model,
        tools: ["read", "bash", "find", "grep", "lsp_diagnostics"],
        task: reviewerPrompt(plan, item, worktreePath),
        timeoutMs,
        onEvent: callbacks?.onAgentEvent,
      });

      if (result.reviewer.exitCode !== 0)
        result.errors.push(`reviewer exited ${result.reviewer.exitCode}`);
      const verdict = reviewVerdict(result.reviewer.finalOutput);
      if (verdict === "approved" && result.errors.length === 0) {
        result.approved = true;
        callbacks?.onItemStatus?.(item, "approved", { attempt, maxAttempts });
        return result;
      }

      result.approved = false;
      result.errors.push("reviewer requested changes");
      reviewerFeedback = result.reviewer.finalOutput;
      callbacks?.onItemStatus?.(item, "changes_requested", {
        errors: result.errors,
        attempt,
        maxAttempts,
      });

      if (attempt < maxAttempts) {
        callbacks?.onItemStatus?.(item, "implementing", {
          worktreePath,
          attempt: attempt + 1,
          maxAttempts,
          feedback: reviewerFeedback,
        });
        continue;
      }
    }

    await checked(
      "peb",
      [
        "comment",
        "add",
        item.issue.id,
        `pebble-orchestrator review did not approve in ${plan.runId} after ${maxAttempts} attempt${maxAttempts === 1 ? "" : "s"}: ${result.errors.join("; ")}\n\n${(result.reviewer?.finalOutput ?? "").slice(0, 4000)}`,
      ],
      plan.repo,
    ).catch(() => undefined);
    return result;
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
      const created = await checked(
        "gh",
        [
          "pr",
          "create",
          "--base",
          plan.baseRef,
          "--head",
          branch,
          "--title",
          title,
          "--body",
          body,
        ],
        result.worktreePath,
        120_000,
      );
      const createdUrl = created.stdout
        .trim()
        .split("\n")
        .find((line) => /^https?:\/\//.test(line.trim()))
        ?.trim();
      result.pr =
        (await findOpenPrForBranch(plan.gitRoot, branch)) ??
        (createdUrl ? { headRefName: branch, url: createdUrl } : undefined);
    }
    const prRef = result.pr?.url ?? (result.pr?.number ? String(result.pr.number) : undefined);
    if (!prRef)
      throw new Error(`Could not determine PR reference for ${branch}; leaving labels unchanged.`);
    await checked("peb", ["closes", "add", result.item.issue.id, "--pr", prRef], plan.repo);
    if (plan.workflow.readyLabel && plan.workflow.reviewLabel) {
      await checked(
        "peb",
        [
          "update",
          result.item.issue.id,
          "--remove-label",
          plan.workflow.readyLabel,
          "--add-label",
          plan.workflow.reviewLabel,
        ],
        plan.repo,
      );
    }
  }

  async function runReady(options: {
    repo?: string;
    cwd: string;
    concurrency: number;
    state?: string;
    model: string;
    timeoutMs: number;
    maxAttempts: number;
    uiDelayMs: number;
    createPrs: boolean;
    onProgress?: (message: string, details?: unknown) => void;
    onPlan?: (plan: Plan) => void;
    onItemStatus?: (item: PlanItem, status: string, details?: unknown) => void;
    onAgentEvent?: (event: AgentProgressEvent) => void;
  }): Promise<{ plan: Plan; results: RunResult[] }> {
    const plan = await createPlan(options);
    options.onPlan?.(plan);
    if (plan.selected.length === 0) {
      options.onProgress?.(
        `${formatPlan(plan)}\n\nNo pebbles selected; nothing to dispatch.`,
        plan,
      );
      return { plan, results: [] };
    }

    options.onProgress?.(
      `${formatPlan(plan)}\n\nDispatching selected pebbles to worktrees...`,
      plan,
    );
    const dispatched = await dispatch(plan, options.model);
    for (const { item, worktreePath } of dispatched)
      options.onItemStatus?.(item, "dispatched", { worktreePath });

    options.onProgress?.(
      `Dispatched ${dispatched.length} pebble${dispatched.length === 1 ? "" : "s"}. Running planner, implementer, and reviewer subagents now...`,
      { plan, dispatched },
    );
    const results = await limitMap(
      dispatched,
      options.concurrency,
      async ({ item, worktreePath }) => {
        if (options.uiDelayMs > 0) {
          options.onItemStatus?.(item, "waiting", { worktreePath, delayMs: options.uiDelayMs });
          options.onProgress?.(
            `UI test delay for ${item.issue.id}: waiting ${options.uiDelayMs}ms before implementer starts.`,
            { plan, item, worktreePath },
          );
          await sleep(options.uiDelayMs);
        }
        options.onProgress?.(
          `Working on ${item.issue.id}: planner/implementer/reviewer subagents are running in ${worktreePath}`,
          { plan, item, worktreePath },
        );
        return runImplementation(
          plan,
          item,
          worktreePath,
          options.model,
          options.timeoutMs,
          options.maxAttempts,
          {
            onItemStatus: options.onItemStatus,
            onAgentEvent: options.onAgentEvent,
          },
        );
      },
    );
    if (options.createPrs) {
      options.onProgress?.("Implementation/review finished. Opening PRs for approved branches...", {
        plan,
        results,
      });
      for (const result of results) {
        try {
          if (result.approved) options.onItemStatus?.(result.item, "opening_pr", result);
          await openPr(plan, result);
          if (result.pr) options.onItemStatus?.(result.item, "pr_opened", result);
        } catch (error) {
          result.errors.push(`PR creation failed: ${formatError(error)}`);
          result.approved = false;
          options.onItemStatus?.(result.item, "pr_failed", { error: formatError(error) });
          await checked(
            "peb",
            [
              "comment",
              "add",
              result.item.issue.id,
              `pebble-orchestrator PR step failed in ${plan.runId}: ${formatError(error)}`,
            ],
            plan.repo,
          ).catch(() => undefined);
        }
      }
    }
    return { plan, results };
  }

  return { runReady };
}
