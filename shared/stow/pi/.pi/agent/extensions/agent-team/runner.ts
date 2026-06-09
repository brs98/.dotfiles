import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import {
  applyUsage,
  emptyUsage,
  getPiInvocation,
  getText,
  type AgentUsage,
} from "../lib/agent-process.js";
import {
  isRoleName,
  roleOrThrow,
  type RoleName,
  type RoleScope,
  type RoleSource,
  type TeamRole,
} from "./roles.js";

export type AgentStatus =
  | "pass"
  | "fail"
  | "needs_human"
  | "needs_research"
  | "needs_spec"
  | "needs_build"
  | "needs_test"
  | "needs_review";

export type TeamAgentResponse = {
  status: AgentStatus;
  summary: string;
  findings: string[];
  relevantFiles: string[];
  changedFiles: string[];
  tests: string[];
  risks: string[];
  openQuestions: string[];
  nextAgent?: RoleName;
  rawText: string;
  parseError?: string;
};

export type TeamRunStep = {
  role: RoleName;
  source: RoleSource;
  status: AgentStatus;
  summary: string;
  durationMs: number;
  model?: string;
  usage: AgentUsage;
  response: TeamAgentResponse;
  stderr: string;
  exitCode: number | null;
};

export type TeamRunDetails = {
  task: string;
  cwd: string;
  roleScope: RoleScope;
  projectRolesDir: string | null;
  alignmentApproved: boolean;
  buildApproved: boolean;
  completed: boolean;
  steps: TeamRunStep[];
};

type AssistantMessage = {
  role?: string;
  content?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
  model?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    cost?: { total?: number };
  };
};

export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const KILL_GRACE_MS = 5_000;
export const DEFAULT_MAX_REPAIR_CYCLES = 3;

function buildSystemPrompt(role: TeamRole): string {
  return [
    role.prompt,
    "",
    "Agent-team protocol:",
    "- You are one role in a coordinated agent team. Stay strictly within your role.",
    "- Respect your available tools. If you cannot complete work safely with your tools, return needs_human or route to the next appropriate role.",
    "- Do not call subagents or agent_team recursively.",
    "- Your final response must be only a JSON object. Do not wrap it in Markdown.",
    "- JSON schema:",
    JSON.stringify(
      {
        status:
          "pass | fail | needs_human | needs_research | needs_spec | needs_build | needs_test | needs_review",
        summary: "Concise result summary.",
        findings: ["Relevant facts discovered or decisions made."],
        relevantFiles: ["Files inspected or relevant to the task."],
        changedFiles: ["Files changed by this role, if any."],
        tests: ["Tests written, run, required, or recommended."],
        risks: ["Risks, edge cases, or concerns."],
        openQuestions: ["Questions that require human input."],
        nextAgent: "Optional recommended next role name.",
      },
      null,
      2,
    ),
  ].join("\n");
}

function buildRoleTask(params: {
  role: RoleName;
  originalTask: string;
  cwd: string;
  steps: TeamRunStep[];
  feedback?: string;
}): string {
  const priorSteps = params.steps.map((step, index) => ({
    index: index + 1,
    role: step.role,
    status: step.status,
    summary: step.summary,
    findings: step.response.findings,
    relevantFiles: step.response.relevantFiles,
    changedFiles: step.response.changedFiles,
    tests: step.response.tests,
    risks: step.response.risks,
    openQuestions: step.response.openQuestions,
  }));

  return [
    `Original user request:\n${params.originalTask}`,
    `Working directory: ${params.cwd}`,
    params.feedback ? `Feedback / reason for this invocation:\n${params.feedback}` : undefined,
    priorSteps.length > 0
      ? `Prior team context:\n${JSON.stringify(priorSteps, null, 2)}`
      : undefined,
    `Now perform the ${params.role} role. Return JSON only.`,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
}

async function writeSystemPrompt(role: TeamRole): Promise<{ dir: string; filePath: string }> {
  const dir = await mkdtemp(join(tmpdir(), "pi-agent-team-"));
  const filePath = join(dir, `${role.name}.md`);
  await withFileMutationQueue(filePath, async () => {
    await writeFile(filePath, buildSystemPrompt(role), { encoding: "utf8", mode: 0o600 });
  });
  return { dir, filePath };
}

function buildArgs(role: TeamRole, task: string, systemPromptPath: string): string[] {
  const args = ["--mode", "json", "--no-session", "-p", "--append-system-prompt", systemPromptPath];
  if (role.model) args.push("--model", role.model);
  if (role.tools.length === 0) args.push("--no-builtin-tools");
  else args.push("--tools", role.tools.join(","));
  args.push(task);
  return args;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function parseStatus(value: unknown): AgentStatus {
  const status = typeof value === "string" ? value : "pass";
  switch (status) {
    case "pass":
    case "fail":
    case "needs_human":
    case "needs_research":
    case "needs_spec":
    case "needs_build":
    case "needs_test":
    case "needs_review":
      return status;
    default:
      return "fail";
  }
}

function parseNextAgent(value: unknown): RoleName | undefined {
  return typeof value === "string" && isRoleName(value) ? value : undefined;
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fence?.[1]) return fence[1].trim();

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) return trimmed.slice(firstBrace, lastBrace + 1);
  return trimmed;
}

function parseAgentResponse(
  rawText: string,
  exitCode: number | null,
  stderr: string,
): TeamAgentResponse {
  if (!rawText.trim()) {
    return {
      status: exitCode === 0 ? "fail" : "fail",
      summary: stderr.trim() || "Agent returned no output.",
      findings: [],
      relevantFiles: [],
      changedFiles: [],
      tests: [],
      risks: [],
      openQuestions: [],
      rawText,
    };
  }

  try {
    const parsed = JSON.parse(stripJsonFence(rawText)) as Record<string, unknown>;
    return {
      status: parseStatus(parsed.status),
      summary: typeof parsed.summary === "string" ? parsed.summary : rawText.trim().slice(0, 1000),
      findings: coerceStringArray(parsed.findings),
      relevantFiles: coerceStringArray(parsed.relevantFiles),
      changedFiles: coerceStringArray(parsed.changedFiles),
      tests: coerceStringArray(parsed.tests),
      risks: coerceStringArray(parsed.risks),
      openQuestions: coerceStringArray(parsed.openQuestions),
      nextAgent: parseNextAgent(parsed.nextAgent),
      rawText,
    };
  } catch (error) {
    return {
      status: exitCode === 0 ? "pass" : "fail",
      summary: rawText.trim().slice(0, 1000),
      findings: [],
      relevantFiles: [],
      changedFiles: [],
      tests: [],
      risks: stderr.trim() ? [stderr.trim()] : [],
      openQuestions: [],
      rawText,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runRole(params: {
  role: TeamRole;
  originalTask: string;
  cwd: string;
  steps: TeamRunStep[];
  feedback?: string;
  timeoutMs: number;
  signal?: AbortSignal;
  onProgress?: (step: Partial<TeamRunStep> & { role: RoleName; summary: string }) => void;
}): Promise<TeamRunStep> {
  const startedAt = Date.now();
  const usage = emptyUsage();
  let finalOutput = "";
  let stderr = "";
  let model = params.role.model;
  let exitCode: number | null = null;
  const task = buildRoleTask({
    role: params.role.name,
    originalTask: params.originalTask,
    cwd: params.cwd,
    steps: params.steps,
    feedback: params.feedback,
  });

  const tmp = await writeSystemPrompt(params.role);

  try {
    const invocation = getPiInvocation(buildArgs(params.role, task, tmp.filePath));

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
        exitCode = code;
        clearTimeout(timeoutTimer);
        resolvePromise();
      };

      const kill = (reason: string) => {
        if (settled) return;
        stderr += stderr ? `\n${reason}` : reason;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!settled) proc.kill("SIGKILL");
        }, KILL_GRACE_MS);
      };

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
        if (
          candidate.type !== "message_end" ||
          !candidate.message ||
          typeof candidate.message !== "object"
        )
          return;

        const message = candidate.message as AssistantMessage;
        if (message.role !== "assistant") return;
        const text = getText(message);
        if (text) {
          finalOutput = text;
          params.onProgress?.({ role: params.role.name, summary: text.slice(0, 500) });
        }
        if (typeof message.model === "string") model = message.model;
        applyUsage(usage, message);
      };

      const timeoutTimer = setTimeout(
        () => kill(`${params.role.name} timed out after ${params.timeoutMs}ms.`),
        params.timeoutMs,
      );

      proc.stdout.on("data", (data) => {
        stdoutBuffer += data.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) processLine(line);
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("error", (error) => {
        stderr += stderr ? `\n${error.message}` : error.message;
        finish(1);
      });

      proc.on("close", (code) => {
        if (stdoutBuffer.trim()) processLine(stdoutBuffer);
        finish(code ?? 0);
      });

      if (params.signal) {
        if (params.signal.aborted) kill(`${params.role.name} aborted.`);
        else
          params.signal.addEventListener("abort", () => kill(`${params.role.name} aborted.`), {
            once: true,
          });
      }
    });
  } finally {
    rmSync(tmp.dir, { recursive: true, force: true });
  }

  const response = parseAgentResponse(finalOutput, exitCode, stderr);
  if (exitCode !== 0 && response.status === "pass") response.status = "fail";

  return {
    role: params.role.name,
    source: params.role.source,
    status: response.status,
    summary: response.summary,
    durationMs: Date.now() - startedAt,
    model,
    usage,
    response,
    stderr,
    exitCode,
  };
}

function formatBullets(title: string, items: string[]): string[] {
  if (items.length === 0) return [];
  return [title, ...items.slice(0, 12).map((item) => `- ${item}`)];
}

function checkpointText(title: string, step: TeamRunStep): string {
  return [
    title,
    "",
    step.summary,
    "",
    ...formatBullets("Findings", step.response.findings),
    ...formatBullets("Risks", step.response.risks),
    ...formatBullets("Open questions", step.response.openQuestions),
  ].join("\n");
}

function specCheckpointText(spec: TeamRunStep): string {
  return [
    "Approve build?",
    "",
    spec.summary,
    "",
    ...formatBullets("Relevant files", spec.response.relevantFiles),
    ...formatBullets("Expected file changes", spec.response.changedFiles),
    ...formatBullets("Tests", spec.response.tests),
    ...formatBullets("Risks", spec.response.risks),
    ...formatBullets("Open questions", spec.response.openQuestions),
  ].join("\n");
}

function needsHuman(step: TeamRunStep): boolean {
  return step.status === "needs_human" || step.response.openQuestions.length > 0;
}

function appendStep(details: TeamRunDetails, step: TeamRunStep): void {
  details.steps.push(step);
}

export function makeProgress(details: TeamRunDetails): string {
  const latest = details.steps.at(-1);
  const lines = [
    `Agent team running: ${details.steps.length} step${details.steps.length === 1 ? "" : "s"} completed.`,
  ];
  if (latest) lines.push(`Latest: ${latest.role} → ${latest.status}: ${latest.summary}`);
  return lines.join("\n");
}

export function finalSummary(details: TeamRunDetails): string {
  const status = details.completed ? "completed" : "stopped";
  const lines = [`Agent team ${status}.`, ""];
  for (const [index, step] of details.steps.entries()) {
    lines.push(`${index + 1}. ${step.role} (${step.source}) → ${step.status}: ${step.summary}`);
  }
  return lines.join("\n");
}

export async function runAgentTeam(params: {
  task: string;
  cwd: string;
  roles: Map<RoleName, TeamRole>;
  roleScope: RoleScope;
  projectRolesDir: string | null;
  maxRepairCycles: number;
  timeoutMs: number;
  signal?: AbortSignal;
  hasUI: boolean;
  confirm: (title: string, body: string) => Promise<boolean>;
  onUpdate?: (details: TeamRunDetails) => void;
}): Promise<TeamRunDetails> {
  const details: TeamRunDetails = {
    task: params.task,
    cwd: params.cwd,
    roleScope: params.roleScope,
    projectRolesDir: params.projectRolesDir,
    alignmentApproved: false,
    buildApproved: false,
    completed: false,
    steps: [],
  };

  const run = async (roleName: RoleName, feedback?: string) => {
    const step = await runRole({
      role: roleOrThrow(params.roles, roleName),
      originalTask: params.task,
      cwd: params.cwd,
      steps: details.steps,
      feedback,
      timeoutMs: params.timeoutMs,
      signal: params.signal,
      onProgress: () => params.onUpdate?.(details),
    });
    appendStep(details, step);
    params.onUpdate?.(details);
    return step;
  };

  const interpreter = await run("interpreter");
  if (interpreter.status === "fail") return details;
  if (params.hasUI) {
    details.alignmentApproved = await params.confirm(
      "Confirm team alignment",
      checkpointText("Confirm team alignment", interpreter),
    );
    if (!details.alignmentApproved) return details;
  } else {
    interpreter.response.openQuestions.push(
      "Human alignment checkpoint required, but no interactive UI is available.",
    );
    interpreter.status = "needs_human";
    return details;
  }

  const researcher = await run("researcher");
  if (needsHuman(researcher) || researcher.status === "fail") return details;

  let spec = await run("spec-writer");
  if (needsHuman(spec) || spec.status === "fail") return details;

  if (params.hasUI) {
    details.buildApproved = await params.confirm("Approve build", specCheckpointText(spec));
    if (!details.buildApproved) return details;
  } else {
    spec.response.openQuestions.push(
      "Build checkpoint required, but no interactive UI is available.",
    );
    spec.status = "needs_human";
    return details;
  }

  let repairFeedback: string | undefined;
  for (let cycle = 0; cycle <= params.maxRepairCycles; cycle += 1) {
    const builder = await run("builder", repairFeedback);
    if (needsHuman(builder) || builder.status === "fail") return details;

    const tester = await run("tester");
    if (needsHuman(tester)) return details;
    if (tester.status !== "pass") {
      if (cycle >= params.maxRepairCycles) return details;
      repairFeedback = `Tester requested another build cycle:\n${tester.response.rawText}`;
      continue;
    }

    const reviewer = await run("reviewer");
    if (needsHuman(reviewer)) return details;
    if (reviewer.status === "pass") {
      details.completed = true;
      return details;
    }

    if (cycle >= params.maxRepairCycles) return details;

    if (reviewer.status === "needs_research" || reviewer.response.nextAgent === "researcher") {
      const followupResearch = await run(
        "researcher",
        `Reviewer requested more research:\n${reviewer.response.rawText}`,
      );
      if (needsHuman(followupResearch) || followupResearch.status === "fail") return details;
      spec = await run(
        "spec-writer",
        "Update the spec using the latest research and reviewer feedback.",
      );
      if (needsHuman(spec) || spec.status === "fail") return details;
      if (params.hasUI) {
        const approved = await params.confirm("Approve updated build", specCheckpointText(spec));
        if (!approved) return details;
      }
      repairFeedback = `Updated spec after reviewer feedback:\n${spec.response.rawText}`;
      continue;
    }

    if (reviewer.status === "needs_spec" || reviewer.response.nextAgent === "spec-writer") {
      spec = await run(
        "spec-writer",
        `Reviewer requested a spec update:\n${reviewer.response.rawText}`,
      );
      if (needsHuman(spec) || spec.status === "fail") return details;
      if (params.hasUI) {
        const approved = await params.confirm("Approve updated build", specCheckpointText(spec));
        if (!approved) return details;
      }
      repairFeedback = `Updated spec after reviewer feedback:\n${spec.response.rawText}`;
      continue;
    }

    repairFeedback = `Reviewer requested another build cycle:\n${reviewer.response.rawText}`;
  }

  return details;
}

export function renderDetails(details: TeamRunDetails, expanded: boolean): string {
  const icon = details.completed ? "✓" : "◐";
  const header = `${icon} agent team ${details.completed ? "completed" : "stopped"} (${details.steps.length} steps)`;
  const steps = expanded ? details.steps : details.steps.slice(-6);
  const lines = [header];

  if (!expanded && details.steps.length > steps.length)
    lines.push(`... ${details.steps.length - steps.length} earlier steps`);

  for (const step of steps) {
    const seconds = (step.durationMs / 1000).toFixed(1);
    lines.push(`\n${step.role} [${step.status}] ${seconds}s`);
    lines.push(step.summary);
    if (expanded && step.response.parseError)
      lines.push(`parse warning: ${step.response.parseError}`);
    if (expanded && step.stderr.trim()) lines.push(`stderr: ${step.stderr.trim().slice(0, 1000)}`);
  }

  if (!details.alignmentApproved) lines.push("\nWaiting for or stopped at alignment checkpoint.");
  else if (!details.buildApproved) lines.push("\nWaiting for or stopped at build checkpoint.");

  return lines.join("\n");
}
