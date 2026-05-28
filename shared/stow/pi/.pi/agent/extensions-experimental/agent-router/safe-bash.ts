import { spawn } from "node:child_process";

import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const DEFAULT_SAFE_BASH_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 50_000;

const allowedCommands = new Set(["find", "git", "ls", "pnpm", "rg"]);
const blockedArgumentValues = new Set([
  "--fix",
  "--watch",
  "--write",
  "--updateSnapshot",
  "-u",
  ">",
  ">>",
  "<",
  "|",
  "&&",
  "||",
  ";",
]);
const blockedArgumentFragments = ["$(", "`", "\0"];
const allowedGitSubcommands = new Set([
  "diff",
  "grep",
  "log",
  "ls-files",
  "rev-parse",
  "show",
  "status",
]);
const allowedPnpmScripts = new Set([
  "check",
  "check-circular",
  "check-format",
  "lint",
  "test",
  "typecheck",
]);
const allowedPnpmExecBins = new Set(["oxfmt", "oxlint", "tsc", "tsgo"]);
const blockedFindActions = new Set([
  "-delete",
  "-exec",
  "-execdir",
  "-fls",
  "-fprint",
  "-fprint0",
  "-fprintf",
  "-ok",
  "-okdir",
]);

interface SafeCommandResult {
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut?: boolean;
}

export function createSafeBashTool() {
  return defineTool({
    name: "safe_bash",
    label: "Safe bash",
    description:
      "Run a constrained, read-only repository command for exploration or validation. This is not a general shell and blocks commands/arguments that can write files or escape the repo.",
    promptSnippet:
      "Use safe_bash for read-only repo exploration and validation commands when bash is unavailable.",
    promptGuidelines: [
      "Use safe_bash for commands like rg, ls, find, git status/diff/log/show, and safe pnpm checks.",
      "Do not use safe_bash for writes, fixes, formatting without --check, file creation, deletion, or arbitrary scripts.",
      "Use write/edit for file modifications so Agent Router can enforce edit boundaries.",
    ],
    parameters: Type.Object({
      command: Type.String({
        description:
          "Command name. Allowed: rg, ls, find, git, pnpm. Shell syntax is not supported.",
      }),
      args: Type.Optional(
        Type.Array(Type.String(), {
          description: "Command arguments as an argv array, not a shell string.",
        }),
      ),
      timeoutMs: Type.Optional(
        Type.Number({
          description: `Timeout in milliseconds. Default: ${DEFAULT_SAFE_BASH_TIMEOUT_MS}.`,
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const command = params.command.trim();
      const args = params.args ?? [];
      const timeoutMs = normalizeTimeout(params.timeoutMs);
      const blockedReason = getBlockedReason(command, args);

      if (blockedReason) {
        return {
          content: [
            {
              type: "text",
              text: `safe_bash blocked command: ${blockedReason}`,
            },
          ],
          details: { command, args, blocked: true, blockedReason },
        };
      }

      const result = await runSafeCommand({
        command,
        args,
        cwd: ctx.cwd,
        timeoutMs,
        signal,
      });

      return {
        content: [{ type: "text", text: formatResult(result) }],
        details: result,
      };
    },
  });
}

function normalizeTimeout(value: unknown): number {
  if (value === undefined) return DEFAULT_SAFE_BASH_TIMEOUT_MS;
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  throw new Error("timeoutMs must be a positive number.");
}

function getBlockedReason(command: string, args: readonly string[]): string | undefined {
  if (!allowedCommands.has(command)) {
    return `${command} is not allowlisted. Allowed commands: ${Array.from(allowedCommands).join(", ")}.`;
  }
  if (command.includes("/") || command.includes("\\")) {
    return "command must be a bare executable name, not a path.";
  }

  const unsafeArg = args.find(isUnsafeGenericArgument);
  if (unsafeArg) return `argument ${JSON.stringify(unsafeArg)} is not safe.`;

  if (command === "find") return getFindBlockedReason(args);
  if (command === "git") return getGitBlockedReason(args);
  if (command === "pnpm") return getPnpmBlockedReason(args);
  return undefined;
}

function isUnsafeGenericArgument(arg: string): boolean {
  if (blockedArgumentValues.has(arg)) return true;
  if (blockedArgumentFragments.some((fragment) => arg.includes(fragment))) return true;
  if (arg.startsWith("/")) return true;
  return arg.split(/[\\/]+/).includes("..");
}

function getFindBlockedReason(args: readonly string[]): string | undefined {
  const blockedAction = args.find((arg) => blockedFindActions.has(arg));
  return blockedAction ? `find action ${blockedAction} can write or execute commands.` : undefined;
}

function getGitBlockedReason(args: readonly string[]): string | undefined {
  const subcommand = args[0];
  if (!subcommand) return "git requires an allowlisted read-only subcommand.";
  if (!allowedGitSubcommands.has(subcommand)) {
    return `git ${subcommand} is not allowlisted. Allowed git subcommands: ${Array.from(allowedGitSubcommands).join(", ")}.`;
  }
  return undefined;
}

function getPnpmBlockedReason(args: readonly string[]): string | undefined {
  const firstArg = args[0];
  if (!firstArg) return "pnpm requires a script or exec command.";

  if (firstArg === "exec") {
    const bin = args[1];
    if (!bin) return "pnpm exec requires an allowlisted binary.";
    if (!allowedPnpmExecBins.has(bin)) {
      return `pnpm exec ${bin} is not allowlisted. Allowed binaries: ${Array.from(allowedPnpmExecBins).join(", ")}.`;
    }
    if (bin === "oxfmt" && !args.includes("--check")) {
      return "pnpm exec oxfmt is only allowed with --check.";
    }
    return undefined;
  }

  if (!allowedPnpmScripts.has(firstArg)) {
    return `pnpm ${firstArg} is not allowlisted. Allowed scripts: ${Array.from(allowedPnpmScripts).join(", ")}.`;
  }
  return undefined;
}

async function runSafeCommand(input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}): Promise<SafeCommandResult> {
  const startedAt = Date.now();

  return await new Promise<SafeCommandResult>((resolvePromise) => {
    const proc = spawn(input.command, input.args, {
      cwd: input.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      resolvePromise({
        command: input.command,
        args: input.args,
        exitCode,
        durationMs: Date.now() - startedAt,
        stdout: truncateOutput(stdout),
        stderr: truncateOutput(stderr),
        timedOut: timedOut || undefined,
      });
    };

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      stderr += stderr
        ? `\nsafe_bash timed out after ${input.timeoutMs}ms.`
        : `safe_bash timed out after ${input.timeoutMs}ms.`;
      proc.kill("SIGTERM");
    }, input.timeoutMs);

    proc.stdout.on("data", (data) => {
      stdout = appendOutput(stdout, data.toString());
    });
    proc.stderr.on("data", (data) => {
      stderr = appendOutput(stderr, data.toString());
    });
    proc.on("error", (error) => {
      stderr = appendOutput(stderr, error.message);
      finish(1);
    });
    proc.on("close", (code) => finish(code ?? 0));

    if (input.signal) {
      if (input.signal.aborted) proc.kill("SIGTERM");
      else
        input.signal.addEventListener("abort", () => proc.kill("SIGTERM"), {
          once: true,
        });
    }
  });
}

function appendOutput(current: string, next: string): string {
  return truncateOutput(current + next);
}

function truncateOutput(output: string): string {
  if (Buffer.byteLength(output) <= MAX_OUTPUT_BYTES) return output;
  return `${output.slice(0, MAX_OUTPUT_BYTES)}\n… output truncated to ${MAX_OUTPUT_BYTES} bytes`;
}

function formatResult(result: SafeCommandResult): string {
  return [
    `$ ${result.command} ${result.args.join(" ")}`.trimEnd(),
    `exit=${result.exitCode ?? "unknown"} duration=${(result.durationMs / 1000).toFixed(1)}s${result.timedOut ? " timed-out" : ""}`,
    result.stdout.trim() ? ["", "stdout:", result.stdout.trim()].join("\n") : undefined,
    result.stderr.trim() ? ["", "stderr:", result.stderr.trim()].join("\n") : undefined,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}
