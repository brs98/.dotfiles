import type {
  AgentIntent,
  DelegateMode,
  RouteTaskDelegationOptions,
  RouteTaskInput,
} from "./types";

const intents = new Set<AgentIntent>(["feature", "bugfix", "refactor", "quality", "docs"]);

const delegateModes = new Set<DelegateMode>(["primary", "all"]);

export interface ParsedRouteCommand {
  readonly task: RouteTaskInput;
  readonly delegation: RouteTaskDelegationOptions;
}

export function parseRouteCommandArgs(args: string): ParsedRouteCommand {
  const tokens = tokenize(args);
  const editPaths: string[] = [];
  const readPaths: string[] = [];
  const acceptanceCriteria: string[] = [];
  let title = "Route agent task";
  let description: string | undefined;
  let intent: AgentIntent = "feature";
  let delegate = true;
  let delegateMode: DelegateMode | undefined;
  let delegateTimeoutMs: number | undefined;
  let delegateModel: string | undefined;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const nextToken = tokens[index + 1];

    if (token === "--title") {
      title = requireOptionValue(token, nextToken);
      index += 1;
      continue;
    }
    if (token === "--description") {
      description = requireOptionValue(token, nextToken);
      index += 1;
      continue;
    }
    if (token === "--intent") {
      intent = parseIntent(requireOptionValue(token, nextToken));
      index += 1;
      continue;
    }
    if (token === "--edit" || token === "--edits") {
      editPaths.push(...splitPathToken(requireOptionValue(token, nextToken)));
      index += 1;
      continue;
    }
    if (token === "--read" || token === "--reads") {
      readPaths.push(...splitPathToken(requireOptionValue(token, nextToken)));
      index += 1;
      continue;
    }
    if (token === "--accept" || token === "--criteria") {
      acceptanceCriteria.push(requireOptionValue(token, nextToken));
      index += 1;
      continue;
    }
    if (token === "--delegate") {
      continue;
    }
    if (token === "--delegate-all") {
      delegateMode = "all";
      continue;
    }
    if (token === "--delegate-mode") {
      delegateMode = parseDelegateMode(requireOptionValue(token, nextToken));
      index += 1;
      continue;
    }
    if (token === "--delegate-timeout-ms") {
      delegateTimeoutMs = parsePositiveNumber(requireOptionValue(token, nextToken), token);
      index += 1;
      continue;
    }
    if (token === "--delegate-model") {
      delegateModel = requireOptionValue(token, nextToken);
      index += 1;
      continue;
    }
    if (token?.startsWith("--")) {
      throw new Error(`Unknown option "${token}".`);
    }
    if (token) {
      editPaths.push(token);
    }
  }

  if (editPaths.length === 0 && readPaths.length === 0) {
    throw new Error("Provide at least one path, or use --edit/--read.");
  }

  return {
    task: {
      title,
      description,
      intent,
      editPaths,
      readPaths,
      acceptanceCriteria,
    },
    delegation: {
      delegate,
      delegateMode,
      delegateTimeoutMs,
      delegateModel,
    },
  };
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (!character) continue;

    if (quote) {
      if (character === quote) {
        quote = undefined;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (current.length > 0) tokens.push(current);
  return tokens;
}

function splitPathToken(token: string): string[] {
  return token
    .split(",")
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
}

function requireOptionValue(option: string, value: string | undefined): string {
  if (value && !value.startsWith("--")) return value;
  throw new Error(`${option} requires a value.`);
}

function parseIntent(value: string): AgentIntent {
  if (intents.has(value as AgentIntent)) return value as AgentIntent;
  throw new Error(`Unknown intent "${value}". Use one of: ${Array.from(intents).join(", ")}.`);
}

function parseDelegateMode(value: string): DelegateMode {
  if (delegateModes.has(value as DelegateMode)) return value as DelegateMode;
  throw new Error(
    `Unknown delegate mode "${value}". Use one of: ${Array.from(delegateModes).join(", ")}.`,
  );
}

function parsePositiveNumber(value: string, option: string): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  throw new Error(`${option} must be a positive number.`);
}
