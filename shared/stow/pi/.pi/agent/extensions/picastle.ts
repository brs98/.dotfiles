import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

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

const PICASTLE_BIN = join(homedir(), ".dotfiles", "pi", "picastle", "bin", "picastle");
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
  pi.registerCommand("picastle", {
    description: "Run the Picastle autonomous Pebbles issue runner",
    handler: async (args, ctx) => {
      const parsed = parsePicastleArgs(args ?? "");
      if (parsed.help) {
        notify(ctx, usage(), "info");
        return;
      }

      if (!existsSync(PICASTLE_BIN)) {
        notify(ctx, `Picastle binary not found: ${PICASTLE_BIN}`, "error");
        return;
      }

      const profile = parsed.profile ? PROFILES[parsed.profile] : undefined;
      const repo = repoFromArgs(parsed.passthrough) ?? profile?.repo ?? ctx.cwd;
      const passthrough = hasRepoArg(parsed.passthrough)
        ? parsed.passthrough
        : [...parsed.passthrough, "--repo", repo];

      const cliArgs = parsed.planOnly
        ? ensurePlanOnlyArgs(passthrough)
        : passthrough;
      const env = {
        ...process.env,
        ...inferProfileEnv(repo),
        ...profile?.env,
        ...parsed.env,
        ...(parsed.planOnly ? { PICASTLE_PLAN_ONLY: "1" } : {}),
      };

      mkdirSync(LOG_DIR, { recursive: true });
      const logPath = join(LOG_DIR, `picastle-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
      notify(ctx, `Picastle started for ${shortPath(repo)}\nLog: ${logPath}`, "info");
      if (ctx.hasUI) ctx.ui.setStatus("picastle", "running");

      try {
        const result = await runPicastle(cliArgs, repo, env, logPath, ctx.signal);
        const summary = result.exitCode === 0 ? "Picastle finished" : `Picastle failed (${result.exitCode})`;
        notify(ctx, `${summary}\nLog: ${logPath}\n\n${tail(result.output, 2400)}`, result.exitCode === 0 ? "info" : "error");
      } catch (error) {
        notify(ctx, `Picastle command failed: ${formatError(error)}\nLog: ${logPath}`, "error");
      } finally {
        if (ctx.hasUI) ctx.ui.setStatus("picastle", undefined);
      }
    },
  });
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
  const hasMaxIterations = args.some((arg) => arg === "--max-iterations" || arg.startsWith("--max-iterations="));
  return hasMaxIterations ? args : [...args, "--max-iterations", "1"];
}

function inferProfileEnv(repo: string): Record<string, string> {
  const resolved = resolve(repo);
  if (resolved === DOTFILES_PROFILE.repo) return DOTFILES_PROFILE.env;
  if (resolved === RICEKIT_PROFILE.repo) return RICEKIT_PROFILE.env;
  return {};
}

async function runPicastle(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  logPath: string,
  signal: AbortSignal | undefined,
): Promise<{ exitCode: number; output: string }> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(PICASTLE_BIN, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = `$ ${PICASTLE_BIN} ${args.map(shellQuote).join(" ")}\n`;
    const append = (chunk: Buffer) => {
      output += chunk.toString();
      writeFileSync(logPath, output);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", reject);
    child.on("close", (code, signalName) => {
      if (signalName) output += `\nPicastle terminated by ${signalName}\n`;
      writeFileSync(logPath, output);
      resolvePromise({ exitCode: code ?? 1, output });
    });
    signal?.addEventListener("abort", () => child.kill("SIGTERM"), { once: true });
  });
}

function notify(ctx: ExtensionCommandContext, message: string, level: "info" | "warning" | "error"): void {
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
  ricekit   sets --repo ~/personal/ricekit.git/main plus RiceKit setup hooks`;
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
