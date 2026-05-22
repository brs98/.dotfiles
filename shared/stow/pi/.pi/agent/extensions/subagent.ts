import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateTail,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

type MessageContent = { type: "text"; text: string } | { type: string; [key: string]: unknown };
type AssistantMessage = {
  role: string;
  content?: MessageContent[];
  model?: string;
  provider?: string;
  stopReason?: string;
  errorMessage?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    cost?: { total?: number };
  };
};

type SubagentDetails = {
  task: string;
  cwd: string;
  model?: string;
  exitCode: number | null;
  durationMs: number;
  finalOutput: string;
  stderr: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    turns: number;
  };
  truncated?: boolean;
  fullOutputPath?: string;
};

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const KILL_GRACE_MS = 5_000;

const SubagentParams = Type.Object({
  task: Type.String({
    description:
      "Focused task for the subagent to complete. Include all context the subagent needs.",
  }),
  role: Type.Optional(
    Type.String({
      description:
        "Optional role or operating instructions for the subagent, e.g. 'researcher', 'reviewer', or a detailed persona.",
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description:
        "Working directory for the subagent. Relative paths resolve against the current pi cwd.",
    }),
  ),
  model: Type.Optional(
    Type.String({
      description:
        "Optional pi model pattern/id for the subagent, e.g. 'sonnet:high' or 'openai/gpt-5.5'.",
    }),
  ),
  tools: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Optional allowlist of tool names for the subagent, e.g. ['read','grep','find','ls'].",
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Number({
      description: `Timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.`,
    }),
  ),
});

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

function getText(message: AssistantMessage): string {
  return (message.content ?? [])
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n");
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

function buildArgs(params: {
  task: string;
  role?: string;
  model?: string;
  tools?: string[];
}): string[] {
  const args = ["--mode", "json", "--no-session", "-p"];

  if (params.model) args.push("--model", params.model);
  if (params.tools && params.tools.length > 0) args.push("--tools", params.tools.join(","));

  args.push(buildPrompt(params.task, params.role));
  return args;
}

function applyUsage(details: SubagentDetails, message: AssistantMessage): void {
  if (message.role !== "assistant") return;
  details.usage.turns += 1;

  const usage = message.usage;
  if (!usage) return;

  details.usage.input += usage.input ?? 0;
  details.usage.output += usage.output ?? 0;
  details.usage.cacheRead += usage.cacheRead ?? 0;
  details.usage.cacheWrite += usage.cacheWrite ?? 0;
  details.usage.cost += usage.cost?.total ?? 0;
}

async function maybeTruncateOutput(details: SubagentDetails): Promise<string> {
  const combinedOutput = details.finalOutput || details.stderr || "(no output)";
  const truncation = truncateTail(combinedOutput, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  if (!truncation.truncated) return truncation.content;

  const tempDir = await mkdtemp(join(tmpdir(), "pi-subagent-"));
  const outputPath = join(tempDir, "output.txt");
  await withFileMutationQueue(outputPath, async () => {
    await writeFile(outputPath, combinedOutput, "utf8");
  });

  details.truncated = true;
  details.fullOutputPath = outputPath;
  details.finalOutput = truncation.content;
  if (details.stderr && combinedOutput === details.stderr) details.stderr = truncation.content;

  return `${truncation.content}\n\n[Subagent output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(
    truncation.outputBytes,
  )} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${outputPath}]`;
}

async function runSubagent(params: {
  task: string;
  role?: string;
  cwd: string;
  model?: string;
  tools?: string[];
  timeoutMs: number;
  signal?: AbortSignal;
  onUpdate?: (text: string) => void;
}): Promise<SubagentDetails> {
  const startedAt = Date.now();
  const details: SubagentDetails = {
    task: params.task,
    cwd: params.cwd,
    model: params.model,
    exitCode: null,
    durationMs: 0,
    finalOutput: "",
    stderr: "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
  };

  const invocation = getPiInvocation(buildArgs(params));

  await new Promise<void>((resolvePromise) => {
    const proc = spawn(invocation.command, invocation.args, {
      cwd: params.cwd,
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
      resolvePromise();
    };

    const kill = (reason: string) => {
      if (settled) return;
      details.stderr += details.stderr ? `\n${reason}` : reason;
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) proc.kill("SIGKILL");
      }, KILL_GRACE_MS);
    };

    const timeoutTimer = setTimeout(
      () => kill(`Subagent timed out after ${params.timeoutMs}ms.`),
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
        details.finalOutput = text;
        params.onUpdate?.(text);
      }

      if (typeof message.model === "string") details.model = message.model;
      applyUsage(details, message);
    };

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

    if (params.signal) {
      if (params.signal.aborted) kill("Subagent aborted.");
      else params.signal.addEventListener("abort", () => kill("Subagent aborted."), { once: true });
    }
  });

  details.durationMs = Date.now() - startedAt;
  return details;
}

function formatUsage(details: SubagentDetails): string {
  const parts: string[] = [];
  if (details.usage.turns)
    parts.push(`${details.usage.turns} turn${details.usage.turns === 1 ? "" : "s"}`);
  if (details.usage.input) parts.push(`↑${details.usage.input}`);
  if (details.usage.output) parts.push(`↓${details.usage.output}`);
  if (details.usage.cacheRead) parts.push(`R${details.usage.cacheRead}`);
  if (details.usage.cacheWrite) parts.push(`W${details.usage.cacheWrite}`);
  if (details.usage.cost) parts.push(`$${details.usage.cost.toFixed(3)}`);
  return parts.join(" ");
}

export default function subagent(pi: ExtensionAPI) {
  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description:
      "Delegate a focused task to a separate pi process with an isolated context window. Useful for research, exploration, review, and parallelizable analysis. Output is truncated to safe limits if necessary.",
    promptSnippet:
      "Delegate focused research, exploration, review, or analysis to an isolated pi process.",
    promptGuidelines: [
      "Use subagent for focused research or analysis tasks that would otherwise clutter the main context.",
      "Give subagent all relevant context in the task because it runs in an isolated session.",
      "Prefer read-only tools for exploratory subagent tasks unless the user explicitly asks for implementation work.",
    ],
    parameters: SubagentParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const cwd = params.cwd ? resolve(ctx.cwd, params.cwd) : ctx.cwd;
      const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      const details = await runSubagent({
        task: params.task,
        role: params.role,
        cwd,
        model: params.model,
        tools: params.tools,
        timeoutMs,
        signal,
        onUpdate: (text) => {
          onUpdate?.({
            content: [{ type: "text", text: text || "(subagent running...)" }],
            details: {
              task: params.task,
              cwd,
              model: params.model,
              exitCode: null,
              durationMs: 0,
              finalOutput: text,
              stderr: "",
              usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
            } satisfies SubagentDetails,
          });
        },
      });

      const output = await maybeTruncateOutput(details);
      const isError = details.exitCode !== 0;
      const text = isError
        ? `Subagent failed with exit code ${details.exitCode}.\n\n${output}`
        : output;

      return {
        content: [{ type: "text", text }],
        details,
      };
    },

    renderCall(args, theme) {
      const task = typeof args.task === "string" ? args.task : "...";
      const preview = task.length > 80 ? `${task.slice(0, 80)}...` : task;
      let text =
        theme.fg("toolTitle", theme.bold("subagent ")) +
        theme.fg("accent", args.model ?? "default model");
      if (args.cwd) text += theme.fg("muted", ` in ${args.cwd}`);
      text += `\n  ${theme.fg("dim", preview)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details as SubagentDetails | undefined;
      if (isPartial) return new Text(theme.fg("warning", "Subagent running..."), 0, 0);
      if (!details) return new Text("(no subagent details)", 0, 0);

      const ok = details.exitCode === 0;
      const icon = ok ? theme.fg("success", "✓") : theme.fg("error", "✗");
      const duration = `${(details.durationMs / 1000).toFixed(1)}s`;
      let text = `${icon} ${theme.fg("toolTitle", theme.bold("subagent"))} ${theme.fg("muted", duration)}`;
      if (details.model) text += theme.fg("muted", ` ${details.model}`);

      const usage = formatUsage(details);
      if (usage) text += `\n${theme.fg("dim", usage)}`;
      if (details.truncated && details.fullOutputPath) {
        text += `\n${theme.fg("warning", `Output truncated: ${details.fullOutputPath}`)}`;
      }

      if (expanded) {
        text += `\n\n${theme.fg("muted", "cwd: ")}${theme.fg("dim", details.cwd)}`;
        text += `\n${theme.fg("muted", "task: ")}${theme.fg("dim", details.task)}`;
        if (details.stderr.trim()) text += `\n\n${theme.fg("error", details.stderr.trim())}`;
        if (details.finalOutput.trim())
          text += `\n\n${theme.fg("toolOutput", details.finalOutput.trim())}`;
      } else if (details.finalOutput.trim()) {
        const preview = details.finalOutput.trim().split("\n").slice(0, 8).join("\n");
        text += `\n${theme.fg("toolOutput", preview)}`;
        if (details.finalOutput.trim().split("\n").length > 8)
          text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
      }

      return new Text(text, 0, 0);
    },
  });
}
