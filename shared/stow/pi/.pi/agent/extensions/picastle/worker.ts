import { writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";

export type PicastleProfile = {
  repo: string;
  env: Record<string, string>;
};

export type ParsedPicastleArgs = {
  help: boolean;
  planOnly: boolean;
  stop: boolean;
  profile?: string;
  env: Record<string, string>;
  passthrough: string[];
};

export type PicastleRunState = {
  repo: string;
  logPath: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "finished" | "failed";
  runtimeDir?: string;
  iterationsStarted?: number;
  error?: string;
};

export type PicastleRunResult = {
  repoRoot: string;
  runtimeDir: string;
  iterationsStarted: number;
};

type PicastleWorkerMessage =
  | { type: "output"; chunk: string; stream: "stdout" | "stderr" }
  | { type: "done"; result: PicastleRunResult }
  | { type: "error"; error: string; stack?: string };

export const PICASTLE_MAIN = join(homedir(), ".dotfiles", "pi", "picastle", "main.mts");
export const LOG_DIR = join(homedir(), ".cache", "picastle", "pi-command-logs");

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
    PICASTLE_CLEAN_TARGETS: "1",
    PICASTLE_MIN_FREE_GB: "40",
    PICASTLE_CONCURRENCY: "2",
    PICASTLE_WORKTREE_READY_COMMAND:
      "npm install && npm --prefix ui install && npm --prefix e2e install",
    PICASTLE_BEFORE_PUSH_COMMAND: "bash scripts/bundle-rust-binaries.sh",
  },
};

export const PROFILES: Record<string, PicastleProfile> = {
  dotfiles: DOTFILES_PROFILE,
  ricekit: RICEKIT_PROFILE,
};

export async function capturePicastleOutput<T>(
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

export function appendLog(logPath: string, text: string): void {
  writeFileSync(logPath, text, { flag: "a" });
}

export function runPicastleWorker(args: {
  cliArgs: string[];
  repo: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal | undefined;
  onOutput: (chunk: string, stream: "stdout" | "stderr") => void;
  onWorker?: (worker: Worker) => void;
}): Promise<PicastleRunResult> {
  return new Promise((resolvePromise, reject) => {
    const worker = new Worker(PICASTLE_WORKER_SOURCE, {
      eval: true,
      workerData: {
        mainPath: PICASTLE_MAIN,
        cliArgs: args.cliArgs,
        repo: args.repo,
        env: args.env,
      },
    });
    args.onWorker?.(worker);
    let settled = false;

    const cleanup = () => {
      args.signal?.removeEventListener("abort", abort);
    };
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const abort = () => {
      void worker.terminate();
      settle(() => reject(new Error("Picastle run aborted")));
    };

    args.signal?.addEventListener("abort", abort, { once: true });
    if (args.signal?.aborted) {
      abort();
      return;
    }

    worker.on("message", (message: PicastleWorkerMessage) => {
      if (message.type === "output") {
        args.onOutput(message.chunk, message.stream);
      } else if (message.type === "done") {
        settle(() => resolvePromise(message.result));
      } else if (message.type === "error") {
        const error = new Error(message.error);
        if (message.stack) error.stack = message.stack;
        settle(() => reject(error));
      }
    });
    worker.on("error", (error) => settle(() => reject(error)));
    worker.on("exit", (code) => {
      if (settled) return;
      if (code === 0) {
        settle(() => reject(new Error("Picastle worker exited before reporting completion")));
        return;
      }
      settle(() => reject(new Error(`Picastle worker exited with code ${code}`)));
    });
  });
}

const PICASTLE_WORKER_SOURCE = `
  import { parentPort, workerData } from "node:worker_threads";
  import { pathToFileURL } from "node:url";

  try {
    const module = await import(pathToFileURL(workerData.mainPath).href);
    const result = await module.runPicastle(workerData.cliArgs, {
      cwd: workerData.repo,
      env: workerData.env,
      runPrep: true,
      onOutput: (chunk, stream) => parentPort.postMessage({ type: "output", chunk, stream }),
    });
    parentPort.postMessage({ type: "done", result });
  } catch (error) {
    parentPort.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
`;

export function parsePicastleArgs(args: string): ParsedPicastleArgs {
  const tokens = shellWords(args);
  const parsed: ParsedPicastleArgs = {
    help: false,
    planOnly: false,
    stop: false,
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
    if (token === "stop" || token === "cancel") {
      parsed.stop = true;
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

export function repoFromArgs(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--repo") return args[i + 1] ? resolve(args[i + 1]!) : undefined;
    if (arg.startsWith("--repo=")) return resolve(arg.slice("--repo=".length));
  }
  return undefined;
}

export function hasRepoArg(args: string[]): boolean {
  return args.some((arg) => arg === "--repo" || arg.startsWith("--repo="));
}

export function ensurePlanOnlyArgs(args: string[]): string[] {
  const hasMaxIterations = args.some(
    (arg) => arg === "--max-iterations" || arg.startsWith("--max-iterations="),
  );
  return hasMaxIterations ? args : [...args, "--max-iterations", "1"];
}

export function inferProfileEnv(repo: string): Record<string, string> {
  const resolved = resolve(repo);
  if (resolved === DOTFILES_PROFILE.repo) return DOTFILES_PROFILE.env;
  if (resolved === RICEKIT_PROFILE.repo) return RICEKIT_PROFILE.env;
  return {};
}

export function tail(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `…${text.slice(-maxChars)}`;
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
