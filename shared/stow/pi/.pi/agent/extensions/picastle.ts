import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type PicastleProfile = {
  repo: string;
  env: Record<string, string>;
};

type ParsedPicastleArgs = {
  help: boolean;
  planOnly: boolean;
  profile?: string;
  env: Record<string, string>;
  passthrough: string[];
};

type PicastleRunState = {
  repo: string;
  logPath: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "finished" | "failed";
  runtimeDir?: string;
  iterationsStarted?: number;
  error?: string;
};

type PicastleModule = {
  runPicastle: (
    argv: string[],
    options: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      signal?: AbortSignal;
      runPrep?: boolean;
      onOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
    },
  ) => Promise<{ repoRoot: string; runtimeDir: string; iterationsStarted: number }>;
};

const PICASTLE_MAIN = join(homedir(), ".dotfiles", "pi", "picastle", "main.mts");
const LOG_DIR = join(homedir(), ".cache", "picastle", "pi-command-logs");

const DOTFILES_PROFILE: PicastleProfile = {
  repo: join(homedir(), ".dotfiles"),
  env: {
    PICASTLE_PEB_REMOTE: "pi",
    PICASTLE_PEB_REPO: "dotfiles",
  },
};

const RICEKIT_PROFILE: PicastleProfile = {
  repo: join(homedir(), "personal", "ricekit.git", "main"),
  env: {
    PICASTLE_PEB_REMOTE: "pi",
    PICASTLE_PEB_REPO: "ricekit",
    PICASTLE_WORKTREE_READY_COMMAND:
      "npm install && npm --prefix ui install && npm --prefix e2e install",
    PICASTLE_BEFORE_PUSH_COMMAND: "bash scripts/bundle-rust-binaries.sh",
  },
};

const PROFILES: Record<string, PicastleProfile> = {
  dotfiles: DOTFILES_PROFILE,
  ricekit: RICEKIT_PROFILE,
};

export default function picastleExtension(pi: ExtensionAPI) {
  let latestRun: PicastleRunState | undefined;
  let activeRun: Promise<void> | undefined;

  pi.registerTool({
    name: "picastle_status",
    label: "Picastle Status",
    description: "Inspect the latest /picastle run status and a bounded tail of its log.",
    parameters: Type.Object({
      tailChars: Type.Optional(
        Type.Number({ description: "Log tail size. Defaults to 4000, max 12000." }),
      ),
    }),
    async execute(_toolCallId, params) {
      const tailChars = Math.max(0, Math.min(Number(params.tailChars ?? 4000), 12000));
      if (!latestRun) {
        return {
          content: [{ type: "text", text: "No Picastle run has started in this Pi session." }],
          details: undefined,
        };
      }

      const logTail = existsSync(latestRun.logPath)
        ? tail(readFileSync(latestRun.logPath, "utf8"), tailChars)
        : "<log not found>";
      return {
        content: [
          {
            type: "text",
            text: [
              `status: ${latestRun.status}`,
              `repo: ${latestRun.repo}`,
              `log: ${latestRun.logPath}`,
              latestRun.runtimeDir ? `runtime: ${latestRun.runtimeDir}` : undefined,
              latestRun.iterationsStarted !== undefined
                ? `iterations started: ${latestRun.iterationsStarted}`
                : undefined,
              latestRun.error ? `error: ${latestRun.error}` : undefined,
              "",
              logTail,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
        details: latestRun,
      };
    },
  });

  pi.registerCommand("picastle", {
    description: "Run the Picastle autonomous Pebbles issue runner",
    handler: async (args, ctx) => {
      const parsed = parsePicastleArgs(args ?? "");
      if (parsed.help) {
        notify(ctx, usage(), "info");
        return;
      }

      if (activeRun) {
        notify(
          ctx,
          "Picastle is already running in this Pi session. Use picastle_status for progress.",
          "warning",
        );
        return;
      }

      if (!existsSync(PICASTLE_MAIN)) {
        notify(ctx, `Picastle runner not found: ${PICASTLE_MAIN}`, "error");
        return;
      }

      const profile = parsed.profile ? PROFILES[parsed.profile] : undefined;
      const repo = repoFromArgs(parsed.passthrough) ?? profile?.repo ?? ctx.cwd;
      const passthrough = hasRepoArg(parsed.passthrough)
        ? parsed.passthrough
        : [...parsed.passthrough, "--repo", repo];

      const cliArgs = parsed.planOnly ? ensurePlanOnlyArgs(passthrough) : passthrough;
      const env = {
        ...process.env,
        ...inferProfileEnv(repo),
        ...profile?.env,
        ...parsed.env,
        ...(parsed.planOnly ? { PICASTLE_PLAN_ONLY: "1" } : {}),
      };

      mkdirSync(LOG_DIR, { recursive: true });
      const logPath = join(
        LOG_DIR,
        `picastle-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
      );
      latestRun = {
        repo,
        logPath,
        startedAt: new Date().toISOString(),
        status: "running",
      };

      sendPicastleBrief(pi, { repo, logPath, cliArgs, env, profile: parsed.profile });
      notify(ctx, `Picastle started for ${shortPath(repo)}\nLog: ${logPath}`, "info");
      if (ctx.hasUI) ctx.ui.setStatus("picastle", "running");

      activeRun = (async () => {
        try {
          const result = await capturePicastleOutput(logPath, async (onOutput) => {
            const module = (await import(pathToFileURL(PICASTLE_MAIN).href)) as PicastleModule;
            return await module.runPicastle(cliArgs, {
              cwd: repo,
              env,
              signal: ctx.signal,
              runPrep: true,
              onOutput,
            });
          });
          latestRun = {
            ...latestRun!,
            status: "finished",
            finishedAt: new Date().toISOString(),
            runtimeDir: result.value.runtimeDir,
            iterationsStarted: result.value.iterationsStarted,
          };
          notify(ctx, `Picastle finished\nLog: ${logPath}\n\n${tail(result.output, 2400)}`, "info");
        } catch (error) {
          latestRun = {
            ...latestRun!,
            status: "failed",
            finishedAt: new Date().toISOString(),
            error: formatError(error),
          };
          appendLog(logPath, `\nPicastle command failed: ${formatError(error)}\n`);
          notify(ctx, `Picastle command failed: ${formatError(error)}\nLog: ${logPath}`, "error");
        } finally {
          if (ctx.hasUI) ctx.ui.setStatus("picastle", undefined);
          activeRun = undefined;
        }
      })();

      return;
    },
  });
}

function sendPicastleBrief(
  pi: ExtensionAPI,
  run: {
    repo: string;
    logPath: string;
    cliArgs: string[];
    env: NodeJS.ProcessEnv;
    profile?: string;
  },
): void {
  pi.sendMessage(
    {
      customType: "picastle-session-brief",
      display: true,
      content: `Picastle has started as a first-class Pi extension command.

Repository: ${run.repo}
Log: ${run.logPath}
Profile: ${run.profile ?? "<none>"}
Command args: ${run.cliArgs.map(shellQuote).join(" ") || "<none>"}
Queue: status=${run.env.PICASTLE_ISSUE_STATUS ?? "policy/default"}${run.env.PICASTLE_ISSUE_LABEL ? ` label=${run.env.PICASTLE_ISSUE_LABEL}` : ""}
Default loop: Picastle plans, implements, reviews/publishes, fans in pending Pebbles intents, then plans again until no unblocked issues remain or PICASTLE_MAX_ITERATIONS is reached (default 20).

How to help:
- Use the picastle_status tool to inspect the latest run and bounded log tail.
- Treat Pebbles as the source of truth. Picastle worktrees live under ~/.cache/picastle/<repo>/worktrees.
- Do not mutate Picastle worktrees, branches, PRs, or Pebbles state unless the user explicitly asks for intervention.
- If Picastle stops or fails, inspect the log/runtime directory, identify the phase (recovery/planner/implementer/reviewer/publisher/fan-in), and propose the smallest recovery step.`,
      details: {
        repo: run.repo,
        logPath: run.logPath,
        cliArgs: run.cliArgs,
        profile: run.profile,
      },
    },
    { deliverAs: "nextTurn" },
  );
}

async function capturePicastleOutput<T>(
  logPath: string,
  fn: (onOutput: (chunk: string, stream: "stdout" | "stderr") => void) => Promise<T>,
): Promise<{ value: T; output: string }> {
  let output = "";
  const append = (text: string) => {
    output += text;
    writeFileSync(logPath, output);
  };

  append(`# /picastle\n# started: ${new Date().toISOString()}\n\n`);
  const value = await fn((chunk) => append(chunk));
  return { value, output };
}

function appendLog(logPath: string, text: string): void {
  writeFileSync(logPath, text, { flag: "a" });
}

function parsePicastleArgs(args: string): ParsedPicastleArgs {
  const tokens = shellWords(args);
  const parsed: ParsedPicastleArgs = {
    help: false,
    planOnly: false,
    env: {},
    passthrough: [],
  };

  let passthroughOnly = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (passthroughOnly) {
      parsed.passthrough.push(token);
      continue;
    }

    if (token === "--") {
      passthroughOnly = true;
      continue;
    }
    if (token === "help" || token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }
    if (token === "plan" || token === "dry-run") {
      parsed.planOnly = true;
      continue;
    }
    if (token in PROFILES) {
      parsed.profile = token;
      continue;
    }
    if (token === "--env" || token === "-E") {
      const assignment = tokens[++i];
      if (!assignment) throw new Error(`${token} requires KEY=VALUE`);
      setEnvAssignment(parsed.env, assignment);
      continue;
    }
    if (token.startsWith("--env=")) {
      setEnvAssignment(parsed.env, token.slice("--env=".length));
      continue;
    }

    parsed.passthrough.push(token);
  }

  return parsed;
}

function setEnvAssignment(env: Record<string, string>, assignment: string): void {
  const index = assignment.indexOf("=");
  if (index <= 0) throw new Error(`Invalid env assignment: ${assignment}`);
  env[assignment.slice(0, index)] = assignment.slice(index + 1);
}

function shellWords(input: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\" && quote !== "'") {
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
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaping) current += "\\";
  if (quote) throw new Error("Unclosed quote in /picastle arguments");
  if (current) words.push(current);
  return words;
}

function repoFromArgs(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--repo") return args[i + 1] ? resolve(args[i + 1]!) : undefined;
    if (arg.startsWith("--repo=")) return resolve(arg.slice("--repo=".length));
  }
  return undefined;
}

function hasRepoArg(args: string[]): boolean {
  return args.some((arg) => arg === "--repo" || arg.startsWith("--repo="));
}

function ensurePlanOnlyArgs(args: string[]): string[] {
  const hasMaxIterations = args.some(
    (arg) => arg === "--max-iterations" || arg.startsWith("--max-iterations="),
  );
  return hasMaxIterations ? args : [...args, "--max-iterations", "1"];
}

function inferProfileEnv(repo: string): Record<string, string> {
  const resolved = resolve(repo);
  if (resolved === DOTFILES_PROFILE.repo) return DOTFILES_PROFILE.env;
  if (resolved === RICEKIT_PROFILE.repo) return RICEKIT_PROFILE.env;
  return {};
}

function notify(
  ctx: ExtensionCommandContext,
  message: string,
  level: "info" | "warning" | "error",
): void {
  if (ctx.hasUI) ctx.ui.notify(message, level);
  else console.log(message);
}

function usage(): string {
  return `Usage: /picastle [plan] [dotfiles|ricekit] [--env KEY=VALUE] [-- <picastle args>]

Examples:
  /picastle plan
  /picastle dotfiles plan
  /picastle ricekit -- --max-iterations 1
  /picastle -- --repo /path/to/repo

Profiles:
  dotfiles  sets --repo ~/.dotfiles and Pebbles remote dotfiles
  ricekit   sets --repo ~/personal/ricekit.git/main plus RiceKit setup hooks

The default Picastle runner repeats plan → implement → review/publish → fan-in until no unblocked pebbles remain, capped by PICASTLE_MAX_ITERATIONS=20 unless overridden.`;
}

function tail(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `…${text.slice(-maxChars)}`;
}

function shortPath(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:=+-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
