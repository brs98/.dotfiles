import { spawnSync } from "node:child_process";
import { isAbsolute, join, relative, resolve } from "node:path";

import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";

type ReviewCommandMode = "source";
type ReviewStep = { argv: string[]; cwd: string; mode: ReviewCommandMode };

export type ReviewCommandPlan = {
  command: string;
  mode: ReviewCommandMode;
  steps: ReviewStep[];
};

const REVIEW_CHECK_PARAMETERS = {
  type: "object",
  properties: {
    command: {
      type: "string",
      description:
        "Single read-only review command to run. Mutating git/gh/peb commands, shell redirection, and project-code execution are rejected.",
    },
  },
  required: ["command"],
  additionalProperties: false,
};

const SOURCE_COMMANDS = new Set(["git", "peb", "gh", "grep", "find", "ls", "pwd", "cat", "head", "tail", "wc"]);
const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  "status",
  "diff",
  "log",
  "show",
  "rev-parse",
  "rev-list",
  "ls-files",
  "grep",
  "blame",
  "branch",
  "merge-base",
]);
const READ_ONLY_PEB_SUBCOMMANDS = new Set(["show", "list", "pr"]);
const ALLOWED_PEB_NESTED_SUBCOMMANDS = new Map([
  ["dep", new Set(["list"])],
  ["comment", new Set(["list"])],
  ["closure", new Set(["show"])],
]);
const READ_ONLY_GH_SUBCOMMANDS = new Map([["pr", new Set(["list", "view", "diff", "checks"])]]);
export function createReviewCheckTool(root: string): ToolDefinition {
  const reviewRoot = resolve(root);
  return defineTool({
    name: "review_check",
    label: "review_check",
    description:
      "Run a restricted read-only review command for source inspection. Project-code execution (package scripts, test runners, compilers, and build tools), mutating commands, shell operators, redirects, commits, pushes, PR creation, and Pebbles writes are rejected.",
    promptSnippet: "Run allowlisted read-only review checks without granting a general shell",
    promptGuidelines: [
      "Use review_check instead of bash for git diff/log/status and other read-only source inspection commands.",
      "Do not attempt package scripts, test runners, compilers, mutating commands, or output paths; review_check rejects project-code execution, edits, commits, pushes, PR creation, and Pebbles writes.",
    ],
    parameters: REVIEW_CHECK_PARAMETERS as any,
    async execute(_toolCallId, params: { command: string }) {
      const command = String(params.command ?? "").trim();
      const plan = planReviewCommand(command, reviewRoot);
      const result = executeReviewCommandPlan(plan, reviewRoot);
      const output = [`$ ${command}`, `mode: ${plan.mode}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n");
      if (result.status !== 0) {
        throw new Error(`${truncateOutput(output)}\n\nCommand exited with code ${result.status}`);
      }
      return {
        content: [{ type: "text", text: truncateOutput(output || "(no output)") }],
        details: { command, mode: plan.mode, status: result.status },
      };
    },
  });
}

export function planReviewCommand(command: string, root: string): ReviewCommandPlan {
  const reviewRoot = resolve(root);
  if (!command.trim()) throw new Error("review_check requires a command");

  const segments = splitCommandChain(command);
  const steps: ReviewStep[] = [];
  let cwd = reviewRoot;

  for (const segment of segments) {
    const argv = splitShellWords(segment);
    if (argv.length === 0) continue;

    if (argv[0] === "cd") {
      if (argv.length !== 2) throw new Error("review_check only supports `cd <path>` as a chain step");
      cwd = resolveReviewPath(reviewRoot, cwd, argv[1]!);
      continue;
    }

    const normalized = normalizeCommand(argv, cwd, reviewRoot);
    steps.push(normalized);
    cwd = normalized.cwd;
  }

  if (steps.length === 0) throw new Error("review_check command must include a command to run");
  return { command, mode: "source", steps };
}

function normalizeCommand(argv: string[], cwd: string, root: string): ReviewStep {
  const command = argv[0]!;
  if (!SOURCE_COMMANDS.has(command)) {
    throw new Error(`review_check does not allow command: ${command}`);
  }

  if (command === "git") return normalizeGitCommand(argv, cwd, root);
  if (command === "peb") return normalizePebCommand(argv, cwd);
  if (command === "gh") return normalizeGhCommand(argv, cwd);
  if (command === "find") ensureFindIsReadOnly(argv);

  return { argv, cwd, mode: "source" };
}

function normalizeGitCommand(argv: string[], cwd: string, root: string): ReviewStep {
  const normalized = [...argv];
  let gitCwd = cwd;
  for (let i = 1; i < normalized.length;) {
    const arg = normalized[i];
    if (arg === "-C") {
      const path = normalized[i + 1];
      if (!path) throw new Error("git -C requires a path");
      gitCwd = resolveReviewPath(root, gitCwd, path);
      normalized.splice(i, 2);
      continue;
    }
    if (arg === "--no-pager") {
      normalized.splice(i, 1);
      continue;
    }
    if (arg?.startsWith("-")) throw new Error(`review_check does not allow git global option: ${arg}`);
    break;
  }

  const subcommand = normalized[1];
  if (!subcommand || !READ_ONLY_GIT_SUBCOMMANDS.has(subcommand)) {
    throw new Error(`review_check does not allow git subcommand: ${subcommand ?? "<missing>"}`);
  }
  ensureNoGitWriteOptions(normalized);
  ensureGitSubcommandArgsReadOnly(normalized);
  return { argv: normalized, cwd: gitCwd, mode: "source" };
}

function normalizePebCommand(argv: string[], cwd: string): ReviewStep {
  let index = 1;
  while (index < argv.length) {
    const arg = argv[index]!;
    if (arg === "--remote" || arg === "-R" || arg === "--repo") {
      if (!argv[index + 1]) throw new Error(`${arg} requires a value`);
      index += 2;
      continue;
    }
    if (arg.startsWith("--remote=") || arg.startsWith("--repo=")) {
      index += 1;
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`review_check does not allow peb option: ${arg}`);
    break;
  }

  const subcommand = argv[index];
  if (!subcommand) throw new Error("review_check requires a peb subcommand");
  if (READ_ONLY_PEB_SUBCOMMANDS.has(subcommand)) return { argv, cwd, mode: "source" };

  const nested = ALLOWED_PEB_NESTED_SUBCOMMANDS.get(subcommand);
  if (nested?.has(argv[index + 1]!)) return { argv, cwd, mode: "source" };
  throw new Error(`review_check does not allow peb subcommand: ${subcommand} ${argv[index + 1] ?? ""}`.trim());
}

function normalizeGhCommand(argv: string[], cwd: string): ReviewStep {
  const area = argv[1];
  const subcommand = argv[2];
  if (!area || !subcommand || !READ_ONLY_GH_SUBCOMMANDS.get(area)?.has(subcommand)) {
    throw new Error(`review_check does not allow gh command: ${argv.slice(1).join(" ") || "<missing>"}`);
  }
  return { argv, cwd, mode: "source" };
}

function ensureFindIsReadOnly(argv: string[]): void {
  const forbiddenWriteActions = new Set([
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
  const found = argv.find((arg) => forbiddenWriteActions.has(arg));
  if (found) throw new Error(`review_check does not allow find action: ${found}`);
}

function ensureGitSubcommandArgsReadOnly(argv: string[]): void {
  const subcommand = argv[1];
  if (subcommand !== "branch") return;

  const safeBranchFlags = new Set(["--show-current", "--list", "-a", "--all", "-r", "--remotes", "-v", "-vv"]);
  const unsafe = argv.slice(2).find((arg) => !safeBranchFlags.has(arg));
  if (unsafe) throw new Error(`review_check does not allow git branch argument: ${unsafe}`);
}

function ensureNoGitWriteOptions(argv: string[]): void {
  const forbidden = argv.find(
    (arg) =>
      arg === "--output" ||
      arg.startsWith("--output=") ||
      isGitOptionAbbreviation(arg, "--ext-diff") ||
      isGitOptionAbbreviation(arg, "--textconv") ||
      arg === "--no-index" ||
      arg === "--exec" ||
      arg.startsWith("--exec=") ||
      isGitOpenFilesInPagerOption(arg) ||
      isGitOpenFilesInPagerShortOption(arg) ||
      arg === "-o",
  );
  if (forbidden) throw new Error(`review_check does not allow git option: ${forbidden}`);
}

function isGitOptionAbbreviation(arg: string, fullOption: string): boolean {
  if (!arg.startsWith("--") || arg.startsWith("--no-")) return false;
  const optionName = arg.split("=", 1)[0]!;
  return optionName.length > 2 && fullOption.startsWith(optionName);
}

function isGitOpenFilesInPagerOption(arg: string): boolean {
  if (!arg.startsWith("--")) return false;
  const optionName = arg.split("=", 1)[0]!;
  return optionName.length > 2 && "--open-files-in-pager".startsWith(optionName);
}

function isGitOpenFilesInPagerShortOption(arg: string): boolean {
  return arg.startsWith("-") && !arg.startsWith("--") && arg.slice(1).includes("O");
}

function executeReviewCommandPlan(plan: ReviewCommandPlan, _root: string): { status: number; stdout: string; stderr: string } {
  return executeSteps(plan.steps);
}

function executeSteps(
  steps: ReviewStep[],
): { status: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";

  for (const step of steps) {
    const argv = step.argv[0] === "git" ? gitArgv(step.argv) : step.argv;
    const result = spawnSync(argv[0]!, argv.slice(1), {
      cwd: step.cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
      timeout: 10 * 60 * 1000,
      env: reviewCommandEnv(),
    });
    stdout += result.stdout ?? "";
    stderr += result.stderr ?? "";
    const status = result.status ?? (result.error ? 1 : 0);
    if (status !== 0) return { status, stdout, stderr: stderr + (result.error ? String(result.error) : "") };
  }

  return { status: 0, stdout, stderr };
}

function gitArgv(argv: string[]): string[] {
  const subcommand = argv[1];
  const hardenedArgs = gitSubcommandArgvWithReadOnlyGuards(argv);
  return [
    "git",
    "-c",
    "core.pager=cat",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "diff.external=",
    "-c",
    "credential.helper=",
    ...hardenedArgs.slice(subcommand ? 1 : 0),
  ];
}

function gitSubcommandArgvWithReadOnlyGuards(argv: string[]): string[] {
  const subcommand = argv[1];
  if (!subcommand) return argv;

  if (subcommand === "diff" || subcommand === "log" || subcommand === "show") {
    return ["git", subcommand, "--no-ext-diff", "--no-textconv", ...argv.slice(2)];
  }

  if (subcommand === "grep" || subcommand === "blame") {
    return ["git", subcommand, "--no-textconv", ...argv.slice(2)];
  }

  return argv;
}

function reviewCommandEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    GIT_EXTERNAL_DIFF: "",
    GH_PROMPT_DISABLED: "1",
  };
}

function resolveReviewPath(root: string, cwd: string, path: string): string {
  if (path === "~" || path.startsWith("~/")) throw new Error("review_check paths must stay inside the worktree");
  const resolved = resolve(isAbsolute(path) ? path : join(cwd, path));
  if (!isInside(root, resolved)) throw new Error(`review_check path escapes the worktree: ${path}`);
  return resolved;
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function splitCommandChain(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;

  for (let i = 0; i < command.length; i++) {
    const char = command[i]!;
    if (char === "\n" || char === "\r" || char === ";" || char === "|" || char === "<" || char === ">" || char === "`") {
      throw new Error(`review_check does not allow shell operator: ${JSON.stringify(char)}`);
    }
    if (!quote && char === "&") {
      if (command[i + 1] === "&") {
        segments.push(current.trim());
        current = "";
        i++;
        continue;
      }
      throw new Error("review_check only allows && as a command separator");
    }
    if (char === "'" || char === '"') quote = quote === char ? undefined : quote ?? char;
    current += char;
  }
  if (quote) throw new Error("review_check command has an unterminated quote");
  if (current.trim()) segments.push(current.trim());
  return segments.filter(Boolean);
}

function splitShellWords(segment: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;

  for (let i = 0; i < segment.length; i++) {
    const char = segment[i]!;
    if (char === "\\") throw new Error("review_check does not allow shell escapes");
    if (char === "'" || char === '"') {
      quote = quote === char ? undefined : quote ?? char;
      continue;
    }
    if (!quote && /\s/.test(char)) {
      if (current) {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) throw new Error("review_check command has an unterminated quote");
  if (current) words.push(current);
  return words;
}

function truncateOutput(output: string): string {
  const max = 50_000;
  return output.length <= max ? output : `${output.slice(0, max)}\n... truncated ...`;
}
