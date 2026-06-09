import { spawn } from "node:child_process";
import { applyUsage, getPiInvocation, getText } from "../lib/agent-process.js";
import { makeTempOutputPath, truncateToFile } from "../lib/output.js";
import { choosePokemonForSubagent, type PokemonName } from "./assets/pokemon-art.js";

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

export type SubagentDetails = {
  task: string;
  role?: string;
  cwd: string;
  model?: string;
  pokemon: PokemonName;
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

export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const KILL_GRACE_MS = 5_000;

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

export async function maybeTruncateOutput(details: SubagentDetails): Promise<string> {
  const combinedOutput = details.finalOutput || details.stderr || "(no output)";
  const result = await truncateToFile(combinedOutput, {
    direction: "tail",
    label: "Subagent output",
    outputPath: () => makeTempOutputPath("pi-subagent-", "output.txt"),
  });

  if (!result.truncated) return result.text;

  details.truncated = true;
  details.fullOutputPath = result.fullOutputPath;
  details.finalOutput = result.content;
  if (details.stderr && combinedOutput === details.stderr) details.stderr = result.content;

  return result.text;
}

export async function runSubagent(params: {
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
    role: params.role,
    cwd: params.cwd,
    model: params.model,
    pokemon: choosePokemonForSubagent(params),
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
      applyUsage(details.usage, message);
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
