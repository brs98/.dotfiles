import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

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
  const reviewRoot = resolveReviewRoot(root);
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
  const reviewRoot = resolveReviewRoot(root);
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
  if (command === "peb") return normalizePebCommand(argv, cwd, root);
  if (command === "gh") return normalizeGhCommand(argv, cwd);
  if (command === "find") ensureFindIsReadOnly(argv);
  ensureFilesystemCommandPathsInsideRoot(argv, cwd, root);

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

function normalizePebCommand(argv: string[], cwd: string, root: string): ReviewStep {
  let index = 1;
  while (index < argv.length) {
    const arg = argv[index]!;
    if (arg === "--remote" || arg === "-R" || arg === "--repo") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      ensurePebRepositoryOptionIsSafe(arg, value, cwd, root);
      index += 2;
      continue;
    }
    if (arg.startsWith("--remote=") || arg.startsWith("--repo=")) {
      const [option, value] = splitLongOption(arg);
      if (!value) throw new Error(`${option} requires a value`);
      ensurePebRepositoryOptionIsSafe(option, value, cwd, root);
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
  let index = 1;
  while (index < argv.length && argv[index]!.startsWith("-")) {
    const arg = argv[index]!;
    ensureGhOptionIsSafe(arg);
    throw new Error(`review_check does not allow gh global option: ${arg}`);
  }

  const area = argv[index];
  const subcommand = argv[index + 1];
  if (!area || !subcommand || !READ_ONLY_GH_SUBCOMMANDS.get(area)?.has(subcommand)) {
    throw new Error(`review_check does not allow gh command: ${argv.slice(1).join(" ") || "<missing>"}`);
  }
  for (const arg of argv.slice(index + 2)) ensureGhOptionIsSafe(arg);
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

function ensureFilesystemCommandPathsInsideRoot(argv: string[], cwd: string, root: string): void {
  const command = argv[0]!;
  if (command === "pwd") return;

  const paths = filesystemPathArguments(argv);
  for (const path of paths) {
    ensurePathArgumentInsideRoot(path, cwd, root);
  }
}

function filesystemPathArguments(argv: string[]): string[] {
  const command = argv[0]!;
  if (command === "grep") return grepPathArguments(argv);
  if (command === "find") return findPathArguments(argv);
  if (command === "ls" || command === "cat" || command === "head" || command === "tail" || command === "wc") {
    return simpleFilesystemPathArguments(argv, command);
  }
  return [];
}

function simpleFilesystemPathArguments(argv: string[], command: string): string[] {
  const paths: string[] = [];
  let parsingOptions = true;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (parsingOptions && arg === "--") {
      parsingOptions = false;
      continue;
    }

    if (parsingOptions && arg.startsWith("--") && arg !== "--") {
      const [option, inlineValue] = splitLongOption(arg);
      if (isPathValuedOption(command, option)) {
        const value = inlineValue ?? argv[++i];
        if (!value) throw new Error(`${option} requires a value`);
        paths.push(value);
        continue;
      }
      if (inlineValue === undefined && isValueOption(command, option)) i++;
      continue;
    }

    if (parsingOptions && arg.startsWith("-") && arg !== "-") {
      const valueOption = shortValueOption(command, arg);
      if (valueOption?.pathValue) {
        const value = valueOption.value ?? argv[++i];
        if (!value) throw new Error(`${arg} requires a path value`);
        paths.push(value);
      } else if (valueOption && valueOption.value === undefined) {
        i++;
      }
      continue;
    }

    paths.push(arg);
  }

  return paths;
}

function grepPathArguments(argv: string[]): string[] {
  const paths: string[] = [];
  const positional: string[] = [];
  let parsingOptions = true;
  let hasExplicitPattern = false;

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i]!;
    if (parsingOptions && arg === "--") {
      parsingOptions = false;
      continue;
    }

    if (parsingOptions && arg.startsWith("--") && arg !== "--") {
      const [option, inlineValue] = splitLongOption(arg);
      if (option === "--file" || option === "--exclude-from") {
        const value = inlineValue ?? argv[++i];
        if (!value) throw new Error(`${option} requires a value`);
        paths.push(value);
        if (option === "--file") hasExplicitPattern = true;
        continue;
      }
      if (option === "--regexp") {
        if (inlineValue === undefined) i++;
        hasExplicitPattern = true;
        continue;
      }
      if (inlineValue === undefined && GREP_VALUE_OPTIONS.has(option)) i++;
      continue;
    }

    if (parsingOptions && arg.startsWith("-") && arg !== "-") {
      const consumed = consumeGrepShortOptions(arg, argv, i, paths);
      if (consumed.hasExplicitPattern) hasExplicitPattern = true;
      i += consumed.extraArgs;
      continue;
    }

    positional.push(arg);
  }

  paths.push(...(hasExplicitPattern ? positional : positional.slice(1)));
  return paths;
}

function findPathArguments(argv: string[]): string[] {
  const paths: string[] = [];
  let i = 1;

  for (; i < argv.length; i++) {
    const arg = argv[i]!;
    if (isFindExpressionStart(arg)) break;
    paths.push(arg);
  }

  for (; i < argv.length; i++) {
    const arg = argv[i]!;
    if (FIND_PATH_VALUE_OPTIONS.has(arg)) {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      paths.push(value);
    }
  }

  return paths;
}

const GREP_VALUE_OPTIONS = new Set([
  "--after-context",
  "--before-context",
  "--binary-files",
  "--context",
  "--devices",
  "--directories",
  "--exclude",
  "--exclude-dir",
  "--group-separator",
  "--include",
  "--label",
  "--max-count",
]);
const FIND_PATH_VALUE_OPTIONS = new Set(["-anewer", "-cnewer", "-files0-from", "-newer", "-samefile"]);

function consumeGrepShortOptions(
  arg: string,
  argv: string[],
  index: number,
  paths: string[],
): { extraArgs: number; hasExplicitPattern: boolean } {
  let hasExplicitPattern = false;
  const optionCharsWithValues = new Set(["A", "B", "C", "D", "d", "m"]);

  for (let offset = 1; offset < arg.length; offset++) {
    const option = arg[offset]!;
    const rest = arg.slice(offset + 1);
    if (option === "e" || option === "f") {
      const value = rest || argv[index + 1];
      if (!value) throw new Error(`-${option} requires a value`);
      if (option === "f") paths.push(value);
      hasExplicitPattern = true;
      return { extraArgs: rest ? 0 : 1, hasExplicitPattern };
    }
    if (optionCharsWithValues.has(option)) return { extraArgs: rest ? 0 : 1, hasExplicitPattern };
  }

  return { extraArgs: 0, hasExplicitPattern };
}

function isFindExpressionStart(arg: string): boolean {
  return arg.startsWith("-") || arg === "(" || arg === "!" || arg === ",";
}

function splitLongOption(arg: string): [string, string | undefined] {
  const equalsIndex = arg.indexOf("=");
  if (equalsIndex === -1) return [arg, undefined];
  return [arg.slice(0, equalsIndex), arg.slice(equalsIndex + 1)];
}

function isPathValuedOption(command: string, option: string): boolean {
  return command === "wc" && option === "--files0-from";
}

function isValueOption(command: string, option: string): boolean {
  const optionsByCommand = new Map([
    ["head", new Set(["--bytes", "--lines"])],
    ["tail", new Set(["--bytes", "--lines", "--pid", "--sleep-interval"])],
    [
      "ls",
      new Set([
        "--block-size",
        "--color",
        "--format",
        "--hide",
        "--ignore",
        "--indicator-style",
        "--quoting-style",
        "--sort",
        "--tabsize",
        "--time-style",
        "--width",
      ]),
    ],
  ]);
  return optionsByCommand.get(command)?.has(option) ?? false;
}

function shortValueOption(command: string, arg: string): { value?: string; pathValue: boolean } | undefined {
  const optionCharsByCommand = new Map([
    ["head", new Set(["c", "n"])],
    ["tail", new Set(["c", "n", "s"])],
    ["ls", new Set(["I", "T", "w"])],
  ]);
  const pathOptionCharsByCommand = new Map([["wc", new Set(["0"])]]);
  const pathOption = findShortOptionValue(arg, pathOptionCharsByCommand.get(command));
  if (pathOption) return { value: pathOption.value, pathValue: true };
  const value = findShortOptionValue(arg, optionCharsByCommand.get(command));
  return value ? { value: value.value, pathValue: false } : undefined;
}

function findShortOptionValue(arg: string, optionChars: Set<string> | undefined): { value?: string } | undefined {
  if (!optionChars) return undefined;
  for (let offset = 1; offset < arg.length; offset++) {
    const option = arg[offset]!;
    if (!optionChars.has(option)) continue;
    return { value: arg.slice(offset + 1) || undefined };
  }
  return undefined;
}

function ensurePathArgumentInsideRoot(path: string, cwd: string, root: string): void {
  if (!path || path === "-") return;
  if (path.startsWith("~")) throw new Error(`review_check does not allow home paths for filesystem command arguments: ${path}`);
  if (isAbsolute(path)) throw new Error(`review_check does not allow absolute paths for filesystem command arguments: ${path}`);
  if (hasParentDirectorySegment(path)) {
    throw new Error(`review_check does not allow parent directory segments in filesystem command arguments: ${path}`);
  }

  const resolved = resolve(cwd, path);
  if (!isInside(root, resolved)) throw new Error(`review_check path escapes the worktree: ${path}`);

  const real = realpathForExistingPrefix(resolved);
  if (real && !isInside(realpathIfPresent(root) ?? root, real)) throw new Error(`review_check path escapes the worktree: ${path}`);
}

function hasParentDirectorySegment(path: string): boolean {
  return path.split(/[\\/]+/).includes("..");
}

function realpathIfPresent(path: string): string | undefined {
  try {
    return realpathSync.native(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function realpathForExistingPrefix(path: string): string | undefined {
  const suffix: string[] = [];
  let current = path;
  while (true) {
    const real = realpathIfPresent(current);
    if (real) return suffix.length === 0 ? real : resolve(real, ...suffix.reverse());
    const parent = dirname(current);
    if (parent === current) return undefined;
    suffix.push(basename(current));
    current = parent;
  }
}

function ensurePebRepositoryOptionIsSafe(option: string, value: string, cwd: string, root: string): void {
  if (value.startsWith("~") || hasParentDirectorySegment(value) || isAbsolute(value)) {
    throw new Error(`review_check does not allow peb ${option} path escapes: ${value}`);
  }
  if (/[\\/]/.test(value)) {
    const resolved = resolve(cwd, value);
    const real = realpathIfPresent(resolved) ?? resolved;
    if (!isInside(root, real)) throw new Error(`review_check does not allow peb ${option} path escapes: ${value}`);
    throw new Error(`review_check does not allow path-like peb ${option} values: ${value}`);
  }
}

function ensureGhOptionIsSafe(arg: string): void {
  const [option] = splitLongOption(arg);
  if (option === "--repo" || option === "--web" || option === "--browser" || arg === "-R" || arg === "-w") {
    throw new Error(`review_check does not allow gh option: ${arg}`);
  }
  if (arg.startsWith("-R") && arg !== "-R") throw new Error(`review_check does not allow gh option: ${arg}`);
  if (arg.startsWith("-w") && arg !== "-w") throw new Error(`review_check does not allow gh option: ${arg}`);
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

function executeReviewCommandPlan(plan: ReviewCommandPlan, root: string): { status: number; stdout: string; stderr: string } {
  return executeSteps(plan.steps, root);
}

function executeSteps(
  steps: ReviewStep[],
  root: string,
): { status: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";

  for (const step of steps) {
    const argv = step.argv[0] === "git" ? gitArgv(step.argv) : step.argv;
    const cwd = ensureExecutionCwd(step.cwd, root);
    const result = spawnSync(argv[0]!, argv.slice(1), {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 20,
      timeout: 10 * 60 * 1000,
      env: reviewCommandEnv(),
    });
    stdout += result.stdout ?? "";
    stderr += result.stderr ?? "";
    if (result.status === null) {
      return { status: 1, stdout, stderr: stderr + formatSpawnFailure(result.error, result.signal) };
    }
    if (result.status !== 0) return { status: result.status, stdout, stderr: stderr + (result.error ? String(result.error) : "") };
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

function resolveReviewRoot(root: string): string {
  return realpathSync.native(resolve(root));
}

function resolveReviewPath(root: string, cwd: string, path: string): string {
  if (path === "~" || path.startsWith("~/")) throw new Error("review_check paths must stay inside the worktree");
  const resolved = resolve(isAbsolute(path) ? path : join(cwd, path));
  if (!isInside(root, resolved)) throw new Error(`review_check path escapes the worktree: ${path}`);
  let real: string;
  try {
    real = realpathSync.native(resolved);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(`review_check path does not exist: ${path}`);
    throw error;
  }
  if (!isInside(root, real)) throw new Error(`review_check path escapes the worktree: ${path}`);
  return real;
}

function ensureExecutionCwd(cwd: string, root: string): string {
  const realRoot = resolveReviewRoot(root);
  const realCwd = realpathSync.native(cwd);
  if (!isInside(realRoot, realCwd)) throw new Error(`review_check cwd escapes the worktree: ${cwd}`);
  return realCwd;
}

function formatSpawnFailure(error: Error | undefined, signal: NodeJS.Signals | null): string {
  const details = [signal ? `signal ${signal}` : undefined, error ? error.message : undefined].filter(Boolean).join("; ");
  return details ? `spawn failed: ${details}` : "spawn failed with unknown termination";
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
