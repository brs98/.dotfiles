import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync, type Dirent } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import {
  getAgentDir,
  parseFrontmatter,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  Text,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";

type RoleName = "interpreter" | "researcher" | "spec-writer" | "builder" | "tester" | "reviewer";
type RoleScope = "user" | "project" | "both";
type AgentStatus =
  | "pass"
  | "fail"
  | "needs_human"
  | "needs_research"
  | "needs_spec"
  | "needs_build"
  | "needs_test"
  | "needs_review";

type RoleSource = "bundled" | "user" | "project";

type TeamRole = {
  name: RoleName;
  description: string;
  tools: string[];
  model?: string;
  prompt: string;
  source: RoleSource;
  filePath: string;
};

type AgentUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  turns: number;
};

type TeamAgentResponse = {
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

type TeamRunStep = {
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

type TeamRunDetails = {
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

type RawRoleFrontmatter = {
  name?: string;
  description?: string;
  tools?: string;
  model?: string;
};

type ConfirmDialogStyles = {
  accent: (text: string) => string;
  dim: (text: string) => string;
  bold: (text: string) => string;
};

const DEFAULT_CONFIRM_BODY_LINES = 12;

export class ScrollableConfirmDialog implements Component {
  private scroll = 0;
  private maxScroll = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private readonly title: string,
    private readonly message: string,
    private readonly done: (confirmed: boolean) => void,
    private readonly requestRender: () => void = () => {},
    private readonly styles: ConfirmDialogStyles = plainConfirmDialogStyles(),
    private readonly visibleBodyLines = DEFAULT_CONFIRM_BODY_LINES,
  ) {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.enter) || data === "y" || data === "Y") {
      this.done(true);
      return;
    }

    if (matchesKey(data, Key.escape) || data === "n" || data === "N" || data === "q") {
      this.done(false);
      return;
    }

    if (matchesKey(data, Key.up) || data === "k") {
      this.scrollBy(-1);
      return;
    }

    if (matchesKey(data, Key.down) || data === "j") {
      this.scrollBy(1);
      return;
    }

    if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("b"))) {
      this.scrollBy(-this.visibleBodyLines);
      return;
    }

    if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("f")) || data === " ") {
      this.scrollBy(this.visibleBodyLines);
      return;
    }

    if (matchesKey(data, Key.home) || data === "g") {
      this.setScroll(0);
      return;
    }

    if (matchesKey(data, Key.end) || data === "G") this.setScroll(this.maxScroll);
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const innerWidth = Math.max(32, width - 4);
    const bodyWidth = Math.max(20, innerWidth - 2);
    const bodyLines = wrapMessage(this.message, bodyWidth);
    this.maxScroll = Math.max(0, bodyLines.length - this.visibleBodyLines);
    this.scroll = clamp(this.scroll, 0, this.maxScroll);

    const visibleBody = bodyLines.slice(this.scroll, this.scroll + this.visibleBodyLines);
    while (visibleBody.length < Math.min(this.visibleBodyLines, bodyLines.length || 1)) {
      visibleBody.push("");
    }

    const top = `╭${"─".repeat(innerWidth + 2)}╮`;
    const separator = `├${"─".repeat(innerWidth + 2)}┤`;
    const bottom = `╰${"─".repeat(innerWidth + 2)}╯`;
    const title = this.styles.accent(this.styles.bold(this.title));
    const scrollInfo =
      this.maxScroll > 0
        ? this.styles.dim(`scroll ${this.scroll + 1}/${this.maxScroll + 1}`)
        : this.styles.dim("no overflow");
    const help = this.styles.dim("↑↓/j/k scroll • PgUp/PgDn • y/enter approve • n/esc cancel");

    const lines = [
      top,
      framedLine(joinColumns(title, scrollInfo, innerWidth), innerWidth),
      separator,
      ...visibleBody.map((line) => framedLine(line, innerWidth)),
      separator,
      framedLine(help, innerWidth),
      bottom,
    ];

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private scrollBy(delta: number): void {
    this.setScroll(this.scroll + delta);
  }

  private setScroll(value: number): void {
    const next = clamp(value, 0, this.maxScroll);
    if (next === this.scroll) return;
    this.scroll = next;
    this.invalidate();
    this.requestRender();
  }
}

function plainConfirmDialogStyles(): ConfirmDialogStyles {
  return {
    accent: (text) => text,
    dim: (text) => text,
    bold: (text) => text,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapMessage(message: string, width: number): string[] {
  const lines = message.split("\n").flatMap((line) => {
    if (!line.trim()) return [""];
    const wrapped = wrapTextWithAnsi(line, width);
    return wrapped.length > 0 ? wrapped : [""];
  });
  return lines.length > 0 ? lines : [""];
}

function joinColumns(left: string, right: string, width: number): string {
  const leftWidth = visibleWidth(left);
  const rightWidth = visibleWidth(right);
  if (leftWidth + rightWidth + 1 > width) return truncateToWidth(left, width);
  return `${left}${" ".repeat(width - leftWidth - rightWidth)}${right}`;
}

function framedLine(content: string, width: number): string {
  const truncated = truncateToWidth(content, width);
  const padding = Math.max(0, width - visibleWidth(truncated));
  return `│ ${truncated}${" ".repeat(padding)} │`;
}

async function confirmScrollable(
  ui: ExtensionUIContext,
  title: string,
  message: string,
): Promise<boolean> {
  return ui.custom<boolean>(
    (tui, theme, _keybindings, done) =>
      new ScrollableConfirmDialog(title, message, done, () => tui.requestRender(), {
        accent: (text) => theme.fg("accent", text),
        dim: (text) => theme.fg("dim", text),
        bold: (text) => theme.bold(text),
      }),
    {
      overlay: true,
      overlayOptions: {
        width: "85%",
        minWidth: 60,
        maxHeight: "85%",
        margin: 1,
      },
    },
  );
}

const ROLE_NAMES: readonly RoleName[] = [
  "interpreter",
  "researcher",
  "spec-writer",
  "builder",
  "tester",
  "reviewer",
];

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const KILL_GRACE_MS = 5_000;
const DEFAULT_MAX_REPAIR_CYCLES = 3;

const RoleScopeSchema = StringEnum(["user", "project", "both"] as const, {
  description:
    'Which override role directories to use. Bundled roles are always loaded. Default: "user".',
  default: "user",
});

const AgentTeamParams = Type.Object({
  task: Type.String({
    description:
      "User request for the agent team to interpret, research, spec, build, test, and review.",
  }),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory for the team. Relative paths resolve against current pi cwd.",
    }),
  ),
  roleScope: Type.Optional(RoleScopeSchema),
  confirmProjectRoles: Type.Optional(
    Type.Boolean({
      description: "Prompt before using project-local role overrides. Default: true.",
      default: true,
    }),
  ),
  maxRepairCycles: Type.Optional(
    Type.Number({
      description: `Maximum builder/tester/reviewer repair loops. Default: ${DEFAULT_MAX_REPAIR_CYCLES}.`,
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Number({
      description: `Timeout per role subprocess in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.`,
    }),
  ),
});

function isRoleName(value: string | undefined): value is RoleName {
  return ROLE_NAMES.includes(value as RoleName);
}

function emptyUsage(): AgentUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 };
}

function getExtensionDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function getBundledRolesDir(): string {
  return join(getExtensionDir(), "agent-team-roles");
}

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");

  if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) return { command: process.execPath, args };

  return { command: "pi", args };
}

function nearestProjectRolesDir(cwd: string): string | null {
  let current = cwd;
  while (true) {
    const candidate = join(current, ".pi", "agent-team", "roles");
    try {
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      // keep walking upward
    }

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function parseTools(value: string | undefined): string[] {
  if (!value) return [];
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "none") return [];
  return value
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
}

function loadRolesFromDir(dir: string, source: RoleSource): TeamRole[] {
  if (!existsSync(dir)) return [];

  const roles: TeamRole[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = join(dir, entry.name);
    let content: string;
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter<RawRoleFrontmatter>(content);
    const roleName = frontmatter.name ?? basename(entry.name, ".md");
    if (!isRoleName(roleName)) continue;

    roles.push({
      name: roleName,
      description: frontmatter.description ?? `${roleName} role`,
      tools: parseTools(frontmatter.tools),
      model: frontmatter.model?.trim() || undefined,
      prompt: body.trim(),
      source,
      filePath,
    });
  }

  return roles;
}

function discoverRoles(
  cwd: string,
  scope: RoleScope,
): { roles: Map<RoleName, TeamRole>; projectRolesDir: string | null } {
  const roles = new Map<RoleName, TeamRole>();
  const projectRolesDir = nearestProjectRolesDir(cwd);
  const dirs: Array<{ dir: string; source: RoleSource }> = [
    { dir: getBundledRolesDir(), source: "bundled" },
  ];

  if (scope === "user" || scope === "both") {
    dirs.push({ dir: join(getAgentDir(), "agent-team", "roles"), source: "user" });
  }
  if ((scope === "project" || scope === "both") && projectRolesDir) {
    dirs.push({ dir: projectRolesDir, source: "project" });
  }

  for (const item of dirs) {
    for (const role of loadRolesFromDir(item.dir, item.source)) roles.set(role.name, role);
  }

  return { roles, projectRolesDir };
}

function assertRequiredRoles(roles: Map<RoleName, TeamRole>): string | undefined {
  const missing = ROLE_NAMES.filter((role) => !roles.has(role));
  if (missing.length === 0) return undefined;
  return `Missing agent-team role definitions: ${missing.join(", ")}. Expected bundled roles in ${getBundledRolesDir()}.`;
}

function getText(message: AssistantMessage): string {
  return (message.content ?? [])
    .filter(
      (part): part is { type: string; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n");
}

function applyUsage(usage: AgentUsage, message: AssistantMessage): void {
  if (message.role !== "assistant") return;
  usage.turns += 1;
  usage.input += message.usage?.input ?? 0;
  usage.output += message.usage?.output ?? 0;
  usage.cacheRead += message.usage?.cacheRead ?? 0;
  usage.cacheWrite += message.usage?.cacheWrite ?? 0;
  usage.cost += message.usage?.cost?.total ?? 0;
}

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

function roleOrThrow(roles: Map<RoleName, TeamRole>, name: RoleName): TeamRole {
  const role = roles.get(name);
  if (!role) throw new Error(`Missing role: ${name}`);
  return role;
}

function needsHuman(step: TeamRunStep): boolean {
  return step.status === "needs_human" || step.response.openQuestions.length > 0;
}

function appendStep(details: TeamRunDetails, step: TeamRunStep): void {
  details.steps.push(step);
}

function makeProgress(details: TeamRunDetails): string {
  const latest = details.steps.at(-1);
  const lines = [
    `Agent team running: ${details.steps.length} step${details.steps.length === 1 ? "" : "s"} completed.`,
  ];
  if (latest) lines.push(`Latest: ${latest.role} → ${latest.status}: ${latest.summary}`);
  return lines.join("\n");
}

function finalSummary(details: TeamRunDetails): string {
  const status = details.completed ? "completed" : "stopped";
  const lines = [`Agent team ${status}.`, ""];
  for (const [index, step] of details.steps.entries()) {
    lines.push(`${index + 1}. ${step.role} (${step.source}) → ${step.status}: ${step.summary}`);
  }
  return lines.join("\n");
}

async function runAgentTeam(params: {
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

function renderDetails(details: TeamRunDetails, expanded: boolean): string {
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

export default function agentTeam(pi: ExtensionAPI) {
  pi.registerCommand("team", {
    description: "Run the agent-team workflow for a task",
    handler: async (args) => {
      const task = args.trim();
      if (!task) {
        pi.sendUserMessage("Explain how to use the /team command and agent_team tool.");
        return;
      }
      pi.sendUserMessage(
        `Use the agent_team tool to run this task through the full team workflow: ${task}`,
      );
    },
  });

  pi.registerTool({
    name: "agent_team",
    label: "Agent Team",
    description:
      "Run an automatic multi-agent team workflow with human alignment and build checkpoints. Roles: interpreter, researcher, spec-writer, builder, tester, reviewer.",
    promptSnippet:
      "Run a full agent-team workflow with interpreter, research, spec, build, test, review, and repair loops.",
    promptGuidelines: [
      "Use agent_team when the user asks to build or change code using the coordinated team workflow.",
      "agent_team already includes human alignment and build checkpoints; do not ask for duplicate approval before calling it unless the user's request itself is unclear.",
      "Give agent_team the complete user request and any important constraints because each role runs in an isolated session.",
    ],
    parameters: AgentTeamParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const cwd = params.cwd ? resolve(ctx.cwd, params.cwd) : ctx.cwd;
      const roleScope: RoleScope = params.roleScope ?? "user";
      const discovery = discoverRoles(cwd, roleScope);
      const missing = assertRequiredRoles(discovery.roles);
      if (missing) return { content: [{ type: "text", text: missing }], details: undefined };

      const confirmProjectRoles = params.confirmProjectRoles ?? true;
      const projectRoles = Array.from(discovery.roles.values()).filter(
        (role) => role.source === "project",
      );
      if (projectRoles.length > 0 && confirmProjectRoles) {
        if (!ctx.hasUI) {
          return {
            content: [
              {
                type: "text",
                text: "Canceled: project-local agent-team roles require interactive confirmation.",
              },
            ],
            details: undefined,
          };
        }

        const ok = await confirmScrollable(
          ctx.ui,
          "Use project-local agent-team roles?",
          `Project role overrides are repo-controlled.\n\nRoles: ${projectRoles.map((role) => role.name).join(", ")}\nSource: ${discovery.projectRolesDir ?? "(unknown)"}`,
        );
        if (!ok) {
          return {
            content: [
              { type: "text", text: "Canceled: project-local agent-team roles were not approved." },
            ],
            details: undefined,
          };
        }
      }

      const details = await runAgentTeam({
        task: params.task,
        cwd,
        roles: discovery.roles,
        roleScope,
        projectRolesDir: discovery.projectRolesDir,
        maxRepairCycles: params.maxRepairCycles ?? DEFAULT_MAX_REPAIR_CYCLES,
        timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        signal,
        hasUI: ctx.hasUI,
        confirm: (title, body) => confirmScrollable(ctx.ui, title, body),
        onUpdate: (currentDetails) => {
          onUpdate?.({
            content: [{ type: "text", text: makeProgress(currentDetails) }],
            details: currentDetails,
          });
        },
      });

      return {
        content: [{ type: "text", text: finalSummary(details) }],
        details,
      };
    },

    renderCall(args, theme) {
      const task = typeof args.task === "string" ? args.task : "...";
      const preview = task.length > 100 ? `${task.slice(0, 100)}...` : task;
      return new Text(
        `${theme.fg("toolTitle", theme.bold("agent_team"))}\n${theme.fg("dim", preview)}`,
        0,
        0,
      );
    },

    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details as TeamRunDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "(no agent-team output)", 0, 0);
      }

      const rendered = renderDetails(details, expanded || isPartial);
      const color = details.completed ? "success" : isPartial ? "warning" : "muted";
      return new Text(theme.fg(color, rendered), 0, 0);
    },
  });
}
