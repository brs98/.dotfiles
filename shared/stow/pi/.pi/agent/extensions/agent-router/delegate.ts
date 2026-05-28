import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AgentId, RoutedAgentRole, RoutedAgentWork } from "./types";

export const DEFAULT_DELEGATE_TIMEOUT_MS = 10 * 60 * 1000;
const KILL_GRACE_MS = 5_000;
const HEARTBEAT_MS = 30_000;
const delegatedDepthEnvName = "PI_AGENT_ROUTER_DELEGATE_DEPTH";

interface MessageContent {
  readonly type: string;
  readonly text?: string;
}

interface AssistantMessage {
  readonly role: string;
  readonly content?: readonly MessageContent[];
  readonly model?: string;
  readonly usage?: {
    readonly input?: number;
    readonly output?: number;
    readonly cacheRead?: number;
    readonly cacheWrite?: number;
    readonly cost?: { readonly total?: number };
  };
}

interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  turns: number;
}

export interface DelegatedAgentRun {
  readonly agentId: AgentId;
  readonly role: RoutedAgentRole;
  readonly task: string;
  readonly cwd: string;
  readonly tools: readonly string[];
  readonly model?: string;
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly finalOutput: string;
  readonly stderr: string;
  readonly usage: UsageTotals;
  readonly timedOut?: boolean;
  readonly aborted?: boolean;
}

export async function runDelegatedAgentWork(
  work: RoutedAgentWork,
  options: {
    readonly cwd: string;
    readonly model?: string;
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
    readonly onUpdate?: (agentId: AgentId, text: string) => void;
  },
): Promise<DelegatedAgentRun> {
  const invocation = work.subagentInvocation.arguments;
  const cwd = resolve(options.cwd, invocation.cwd);
  const timeoutMs = options.timeoutMs ?? DEFAULT_DELEGATE_TIMEOUT_MS;
  const startedAt = Date.now();
  const details: MutableDelegatedAgentRun = {
    agentId: work.agentId,
    role: work.role,
    task: invocation.task,
    cwd,
    tools: invocation.tools,
    model: options.model,
    exitCode: null,
    durationMs: 0,
    finalOutput: "",
    stderr: "",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      turns: 0,
    },
  };
  const piInvocation = getPiInvocation(
    buildArgs({
      task: invocation.task,
      role: invocation.role,
      model: options.model,
      tools: invocation.tools,
    }),
  );

  await new Promise<void>((resolvePromise) => {
    const proc = spawn(piInvocation.command, piInvocation.args, {
      cwd,
      env: {
        ...process.env,
        [delegatedDepthEnvName]: String(getCurrentDelegateDepth() + 1),
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutBuffer = "";
    let settled = false;

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      details.exitCode = exitCode;
      details.durationMs = Date.now() - startedAt;
      clearTimeout(timeoutTimer);
      clearInterval(heartbeatTimer);
      resolvePromise();
    };

    const kill = (reason: string, kind: "aborted" | "timed-out") => {
      if (settled) return;
      details.stderr += details.stderr ? `\n${reason}` : reason;
      if (kind === "aborted") details.aborted = true;
      if (kind === "timed-out") details.timedOut = true;
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
      const candidate = event as {
        readonly type?: unknown;
        readonly message?: unknown;
      };
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
        details.finalOutput = text;
        options.onUpdate?.(work.agentId, text);
      }
      if (typeof message.model === "string") details.model = message.model;
      applyUsage(details.usage, message);
    };

    const timeoutTimer = setTimeout(
      () => kill(`Delegated agent timed out after ${timeoutMs}ms.`, "timed-out"),
      timeoutMs,
    );
    const heartbeatTimer = setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      const lastOutput = details.finalOutput.trim();
      options.onUpdate?.(
        work.agentId,
        [
          `Delegated agent still running after ${formatDuration(elapsedMs)}.`,
          lastOutput
            ? `Last final output snapshot:\n${truncateLines(lastOutput, 8)}`
            : "No assistant final output yet.",
        ].join("\n"),
      );
    }, HEARTBEAT_MS);

    proc.stdout.on("data", (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });

    proc.stderr.on("data", (data) => {
      details.stderr += data.toString();
    });

    proc.on("error", (error) => {
      details.stderr += details.stderr ? `\n${error.message}` : error.message;
      finish(1);
    });

    proc.on("close", (code) => {
      if (stdoutBuffer.trim()) processLine(stdoutBuffer);
      finish(code ?? 0);
    });

    if (options.signal) {
      if (options.signal.aborted) kill("Delegated agent aborted.", "aborted");
      else
        options.signal.addEventListener(
          "abort",
          () => kill("Delegated agent aborted.", "aborted"),
          { once: true },
        );
    }
  });

  details.durationMs = Date.now() - startedAt;
  return details;
}

interface MutableDelegatedAgentRun {
  agentId: AgentId;
  role: RoutedAgentRole;
  task: string;
  cwd: string;
  tools: readonly string[];
  model?: string;
  exitCode: number | null;
  durationMs: number;
  finalOutput: string;
  stderr: string;
  usage: UsageTotals;
  timedOut?: boolean;
  aborted?: boolean;
}

function getPiInvocation(args: readonly string[]): {
  readonly command: string;
  readonly args: readonly string[];
} {
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

function buildArgs(params: {
  readonly task: string;
  readonly role?: string;
  readonly model?: string;
  readonly tools?: readonly string[];
}): string[] {
  const args = [
    "--no-extensions",
    "--extension",
    getAgentRouterExtensionPath(),
    "--mode",
    "json",
    "--no-session",
    "-p",
  ];

  if (params.model) args.push("--model", params.model);
  if (params.tools && params.tools.length > 0) args.push("--tools", params.tools.join(","));

  args.push(buildPrompt(params.task, params.role));
  return args;
}

function getAgentRouterExtensionPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "index.ts");
}

function getCurrentDelegateDepth(): number {
  const depth = Number(process.env[delegatedDepthEnvName] ?? "0");
  return Number.isFinite(depth) && depth > 0 ? depth : 0;
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function truncateLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return [...lines.slice(0, maxLines), `… truncated ${lines.length - maxLines} line(s)`].join("\n");
}

function buildPrompt(task: string, role: string | undefined): string {
  const parts = [
    "You are a focused subagent running in an isolated pi session.",
    "Complete only the delegated task. Keep your final response concise and actionable.",
    "Do not recursively call subagents unless the user explicitly asked for nested delegation.",
  ];

  if (role?.trim()) {
    parts.push("", "Role / operating instructions:", role.trim());
  }

  parts.push("", "Delegated task:", task);
  return parts.join("\n");
}

function getText(message: AssistantMessage): string {
  return (message.content ?? [])
    .filter(
      (part): part is { readonly type: "text"; readonly text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n");
}

function applyUsage(usage: UsageTotals, message: AssistantMessage): void {
  usage.turns += 1;
  const messageUsage = message.usage;
  if (!messageUsage) return;

  usage.input += messageUsage.input ?? 0;
  usage.output += messageUsage.output ?? 0;
  usage.cacheRead += messageUsage.cacheRead ?? 0;
  usage.cacheWrite += messageUsage.cacheWrite ?? 0;
  usage.cost += messageUsage.cost?.total ?? 0;
}
