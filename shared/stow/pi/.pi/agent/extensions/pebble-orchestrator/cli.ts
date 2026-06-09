import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { DEFAULT_AGENT_TIMEOUT_MS, DEFAULT_CONCURRENCY, DEFAULT_MODEL } from "./shared.js";

export function parseArgs(input: string): {
  positionals: string[];
  flags: Record<string, string | boolean>;
} {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (const char of input.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
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
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);

  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? "";
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const eq = token.indexOf("=");
    if (eq > 2) {
      flags[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const key = token.slice(2);
    const next = tokens[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return { positionals, flags };
}

function asNumber(value: string | boolean | undefined, fallback: number, max?: number): number {
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  const rounded = Math.floor(parsed);
  return max == null ? rounded : Math.min(rounded, max);
}

export function parseRunOptions(
  args: string,
  cwd: string,
  positionalOffset = 0,
): {
  repo?: string;
  cwd: string;
  concurrency: number;
  state?: string;
  model: string;
  timeoutMs: number;
  maxAttempts: number;
  uiDelayMs: number;
} {
  const parsed = parseArgs(args);
  return {
    repo: parsed.positionals[positionalOffset],
    cwd,
    concurrency: asNumber(parsed.flags.concurrency ?? parsed.flags.c, DEFAULT_CONCURRENCY),
    state: typeof parsed.flags.state === "string" ? parsed.flags.state : undefined,
    model: typeof parsed.flags.model === "string" ? parsed.flags.model : DEFAULT_MODEL,
    timeoutMs: asNumber(parsed.flags.timeoutMs ?? parsed.flags.timeout, DEFAULT_AGENT_TIMEOUT_MS),
    maxAttempts: asNumber(parsed.flags.maxAttempts ?? parsed.flags.attempts, 3),
    uiDelayMs: asNumber(parsed.flags.uiDelayMs ?? parsed.flags.delayMs, 0, 10 * 60 * 1000),
  };
}

type PebblesCompletion = { value: string; label: string; description?: string };

const subcommandCompletions: PebblesCompletion[] = [
  { value: "plan ", label: "plan", description: "Show ready-work plan and triage queue" },
  { value: "triage ", label: "triage", description: "Run interactive triage only" },
  { value: "run-ready ", label: "run-ready", description: "Run ready pebble agents" },
  { value: "run ", label: "run", description: "Alias for run-ready" },
  {
    value: "burn-down ",
    label: "burn-down",
    description: "Run ready pebbles and open PRs",
  },
  { value: "sync ", label: "sync", description: "Run peb sync github" },
  { value: "scroll ", label: "scroll", description: "Scroll the live progress card" },
];

const runFlagCompletions: PebblesCompletion[] = [
  { value: "--dry-run ", label: "--dry-run", description: "Plan only; do not mutate" },
  { value: "--auto-pr ", label: "--auto-pr", description: "Open PRs for approved branches" },
  { value: "--no-dispatch ", label: "--no-dispatch", description: "Do not dispatch agents" },
  { value: "--triage-only ", label: "--triage-only", description: "Only run triage flow" },
  { value: "--concurrency ", label: "--concurrency", description: "Maximum parallel pebbles" },
  { value: "--c ", label: "--c", description: "Alias for --concurrency" },
  { value: "--state ", label: "--state", description: "Pickup label" },
  { value: "--model ", label: "--model", description: "Model for subagents" },
  { value: "--timeoutMs ", label: "--timeoutMs", description: "Per-agent timeout in ms" },
  { value: "--timeout ", label: "--timeout", description: "Alias for --timeoutMs" },
  {
    value: "--maxAttempts ",
    label: "--maxAttempts",
    description: "Implementation/review attempts",
  },
  { value: "--attempts ", label: "--attempts", description: "Alias for --maxAttempts" },
  { value: "--uiDelayMs ", label: "--uiDelayMs", description: "Delay before implementers" },
  { value: "--delayMs ", label: "--delayMs", description: "Alias for --uiDelayMs" },
];

const valueCompletions: Record<string, PebblesCompletion[]> = {
  "--state": ["ready-for-agent", "needs-triage", "needs-info", "ready-for-human", "in-review"].map(
    (value) => ({ value: `${value} `, label: value }),
  ),
  "--concurrency": ["1", "2", "3", "4", "5"].map((value) => ({
    value: `${value} `,
    label: value,
  })),
  "--c": ["1", "2", "3", "4", "5"].map((value) => ({ value: `${value} `, label: value })),
  "--attempts": ["1", "2", "3"].map((value) => ({ value: `${value} `, label: value })),
  "--maxAttempts": ["1", "2", "3"].map((value) => ({
    value: `${value} `,
    label: value,
  })),
  "--timeout": ["300000", "600000", "1800000"].map((value) => ({
    value: `${value} `,
    label: value,
  })),
  "--timeoutMs": ["300000", "600000", "1800000"].map((value) => ({
    value: `${value} `,
    label: value,
  })),
  "--uiDelayMs": ["0", "1000", "5000"].map((value) => ({
    value: `${value} `,
    label: value,
  })),
  "--delayMs": ["0", "1000", "5000"].map((value) => ({
    value: `${value} `,
    label: value,
  })),
  "--model": [{ value: `${DEFAULT_MODEL} `, label: DEFAULT_MODEL }],
};

function splitCompletionToken(prefix: string): { before: string; token: string } {
  const match = /^(.*\s)?(\S*)$/s.exec(prefix);
  return { before: match?.[1] ?? "", token: match?.[2] ?? "" };
}

function completeToken(
  before: string,
  token: string,
  candidates: PebblesCompletion[],
): AutocompleteItem[] | null {
  const lower = token.toLowerCase();
  const filtered = candidates.filter(
    (item) =>
      item.label.toLowerCase().startsWith(lower) ||
      item.value.trim().toLowerCase().startsWith(lower),
  );
  if (filtered.length === 0) return null;
  return filtered.map((item) => ({
    value: `${before}${item.value}`,
    label: item.label,
    description: item.description,
  }));
}

export function pebblesArgumentCompletions(prefix: string): AutocompleteItem[] | null {
  const { before, token } = splitCompletionToken(prefix);
  const eq = token.indexOf("=");
  if (eq > 0) {
    const flag = token.slice(0, eq);
    const valuePrefix = token.slice(eq + 1);
    if (valueCompletions[flag])
      return completeToken(`${before}${flag}=`, valuePrefix, valueCompletions[flag]);
  }

  const previousToken = before.trimEnd().split(/\s+/).pop();
  if (previousToken && valueCompletions[previousToken])
    return completeToken(before, token, valueCompletions[previousToken]);

  const parsed = parseArgs(prefix);
  const first = parsed.positionals[0]?.toLowerCase();
  const completingFirstPositional =
    !token.startsWith("--") &&
    (parsed.positionals.length === 0 ||
      (parsed.positionals.length === 1 && parsed.positionals[0] === token));
  if (completingFirstPositional)
    return completeToken(before, token, [...subcommandCompletions, ...runFlagCompletions]);

  if (first === "scroll") {
    return completeToken(before, token, [
      { value: "up ", label: "up" },
      { value: "down ", label: "down" },
      { value: "page-up ", label: "page-up" },
      { value: "page-down ", label: "page-down" },
    ]);
  }

  const flags =
    first === "sync"
      ? [{ value: "--dry-run ", label: "--dry-run", description: "Report sync without mutating" }]
      : runFlagCompletions;
  if (token === "" || token.startsWith("-")) return completeToken(before, token, flags);
  return null;
}
