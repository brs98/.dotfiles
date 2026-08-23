import { createHash } from "node:crypto";
import { createContext, runInContext, runInNewContext, Script } from "node:vm";
import type { TSchema } from "typebox";
import { Check, Errors } from "typebox/value";
import type { AgentUsage } from "../lib/agent-process.js";

export class WorkflowScriptError extends Error {
  override name = "WorkflowScriptError";
}

export interface WorkflowMetaPhase {
  title: string;
  detail?: string;
}

export interface WorkflowMeta {
  name: string;
  description: string;
  phases?: WorkflowMetaPhase[];
}

export interface AgentCallOptions {
  label?: string;
  phase?: string;
  model?: string;
  role?: string;
  tools?: string[];
  cwd?: string;
  timeoutMs?: number;
  schema?: unknown;
}

export interface AgentInvocation {
  prompt: string;
  label: string;
  phase?: string;
  options: AgentCallOptions;
}

export interface AgentOutcome {
  output: string;
  usage?: AgentUsage;
}

export type AgentRunner = (
  invocation: AgentInvocation,
  signal: AbortSignal | undefined,
) => Promise<AgentOutcome>;

export interface JournalRecord {
  result: unknown;
  label?: string;
}

export interface WorkflowJournal {
  get(key: string): JournalRecord | undefined;
  put(key: string, record: JournalRecord): void;
}

export type WorkflowAgentState = "queued" | "running" | "done" | "cached" | "error";

export interface WorkflowAgentStatus {
  label: string;
  phase?: string;
  status: WorkflowAgentState;
  durationMs?: number;
  error?: string;
}

export interface WorkflowProgress {
  currentPhase?: string;
  phases: string[];
  logs: string[];
  agents: WorkflowAgentStatus[];
}

export interface RunWorkflowOptions {
  script: string;
  args?: unknown;
  runner: AgentRunner;
  journal?: WorkflowJournal;
  onProgress?: (progress: WorkflowProgress) => void;
  signal?: AbortSignal;
  maxConcurrency?: number;
  /** Hard dollar ceiling for spawned agents; agent() throws once spending reaches it. */
  maxCostUsd?: number;
  /** Runaway-loop backstop: maximum agents spawned (journal cache hits are free). */
  maxAgents?: number;
}

export interface WorkflowRunResult {
  meta: WorkflowMeta;
  result: unknown;
  progress: WorkflowProgress;
}

const MAX_LOG_LINES = 500;
const SCHEMA_ATTEMPTS = 2;
const DEFAULT_MAX_AGENTS = 200;
const MAX_ITEMS_PER_CALL = 1024;

/**
 * Determinism guards evaluated inside the sandbox context before the script
 * body. Journal keys hash agent prompts, so any nondeterminism that leaks into
 * a prompt would silently defeat resume caching.
 */
const PRELUDE = `"use strict";
const __wfDetErr = (what) => {
  throw new Error(
    what + " is not available in workflow scripts because it breaks deterministic resume. " +
    "Pass timestamps or random seeds in via \`args\` instead.",
  );
};
Math.random = () => __wfDetErr("Math.random()");
const __wfNativeDate = Date;
const __wfDate = function Date(...dateArgs) {
  if (new.target === undefined) __wfDetErr("Date()");
  if (dateArgs.length === 0) __wfDetErr("new Date() with no arguments");
  return Reflect.construct(__wfNativeDate, dateArgs, __wfNativeDate);
};
__wfDate.prototype = __wfNativeDate.prototype;
__wfDate.parse = __wfNativeDate.parse.bind(__wfNativeDate);
__wfDate.UTC = __wfNativeDate.UTC.bind(__wfNativeDate);
__wfDate.now = () => __wfDetErr("Date.now()");
globalThis.Date = __wfDate;
`;

class Semaphore {
  private readonly waiters: (() => void)[] = [];
  private active = 0;

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      this.waiters.shift()?.();
    };
  }
}

/** Finds the end of the meta object literal, tolerating braces inside strings and comments. */
function scanObjectLiteral(source: string, start: number): number {
  type Mode = "code" | "single" | "double" | "template" | "line" | "block";
  const stack: Mode[] = ["code"];
  let depth = 0;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];
    const mode = stack[stack.length - 1];

    if (mode === "line") {
      if (ch === "\n") stack.pop();
    } else if (mode === "block") {
      if (ch === "*" && next === "/") {
        stack.pop();
        i += 1;
      }
    } else if (mode === "single" || mode === "double") {
      if (ch === "\\") i += 1;
      else if ((mode === "single" && ch === "'") || (mode === "double" && ch === '"')) stack.pop();
    } else if (mode === "template") {
      if (ch === "\\") i += 1;
      else if (ch === "`") stack.pop();
      else if (ch === "$" && next === "{") {
        throw new WorkflowScriptError(
          "meta must be a pure literal: template interpolation (${...}) is not allowed",
        );
      }
    } else {
      if (ch === "'") stack.push("single");
      else if (ch === '"') stack.push("double");
      else if (ch === "`") stack.push("template");
      else if (ch === "/" && next === "/") {
        stack.push("line");
        i += 1;
      } else if (ch === "/" && next === "*") {
        stack.push("block");
        i += 1;
      } else if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
    }
  }

  throw new WorkflowScriptError("meta object literal is never closed");
}

export function extractMeta(source: string): { meta: WorkflowMeta; body: string } {
  const match = /export\s+const\s+meta\s*=/.exec(source);
  if (!match) {
    throw new WorkflowScriptError(
      "workflow script must begin with `export const meta = { name, description, ... }`",
    );
  }

  const afterEquals = match.index + match[0].length;
  const literalStart = source.indexOf("{", afterEquals);
  if (literalStart === -1 || source.slice(afterEquals, literalStart).trim() !== "") {
    throw new WorkflowScriptError("meta must be assigned a plain object literal");
  }

  const literalEnd = scanObjectLiteral(source, literalStart);
  const literal = source.slice(literalStart, literalEnd);

  let value: unknown;
  try {
    value = runInNewContext(`(${literal})`, {}, { timeout: 1_000 });
  } catch (error) {
    throw new WorkflowScriptError(
      `meta literal could not be evaluated: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const meta = value as Partial<WorkflowMeta> | null;
  if (!meta || typeof meta.name !== "string" || !meta.name.trim()) {
    throw new WorkflowScriptError("meta.name must be a non-empty string");
  }
  if (typeof meta.description !== "string" || !meta.description.trim()) {
    throw new WorkflowScriptError("meta.description must be a non-empty string");
  }
  if (meta.phases !== undefined) {
    const valid =
      Array.isArray(meta.phases) &&
      meta.phases.every((p) => p && typeof p === "object" && typeof p.title === "string");
    if (!valid) throw new WorkflowScriptError("meta.phases must be an array of { title, detail? }");
  }

  const body = source.slice(0, match.index) + "const meta =" + source.slice(afterEquals);
  if (/^\s*export\s/m.test(body)) {
    throw new WorkflowScriptError(
      "only `export const meta` is supported; remove other export statements",
    );
  }

  return { meta: meta as WorkflowMeta, body };
}

function stableStringify(value: unknown): string {
  const json = JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const record = v as Record<string, unknown>;
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) sorted[key] = record[key];
      return sorted;
    }
    return v;
  });
  return json ?? "null";
}

function contentHash(prompt: string, options: AgentCallOptions): string {
  const salient = {
    model: options.model,
    role: options.role,
    tools: options.tools,
    cwd: options.cwd,
    schema: options.schema,
  };
  return createHash("sha256")
    .update(prompt)
    .update("\0")
    .update(stableStringify(salient))
    .digest("hex")
    .slice(0, 16);
}

function defaultLabel(prompt: string): string {
  const firstLine = prompt.trimStart().split("\n", 1)[0] ?? "";
  return firstLine.length > 48 ? `${firstLine.slice(0, 48)}…` : firstLine || "agent";
}

type ParseAttempt = { ok: true; value: unknown } | { ok: false; error: string };

function tryParseJson(text: string): ParseAttempt {
  const candidates = [text.trim()];
  const fence = /```(?:json)?\s*\n?([\s\S]*?)```/.exec(text);
  if (fence?.[1]) candidates.push(fence[1].trim());
  const first = text.search(/[[{]/);
  const last = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // try the next extraction strategy
    }
  }
  return { ok: false, error: "reply was not parseable JSON" };
}

function describeSchemaErrors(schema: TSchema, value: unknown): string {
  return [...Errors(schema, value)]
    .slice(0, 5)
    .map((e) => `${e.instancePath || "/"}: ${e.message}`)
    .join("; ");
}

export async function runWorkflowScript(options: RunWorkflowOptions): Promise<WorkflowRunResult> {
  const { signal } = options;
  const { meta, body } = extractMeta(options.script);
  const maxAgents = Math.max(1, Math.floor(options.maxAgents ?? DEFAULT_MAX_AGENTS));
  const maxCostUsd = options.maxCostUsd;
  let spawned = 0;
  let spentUsd = 0;

  const runner: AgentRunner = async (invocation, runnerSignal) => {
    if (spawned >= maxAgents) {
      throw new WorkflowScriptError(
        `agent cap reached (${maxAgents} spawned) — runaway-loop backstop; raise maxAgents if this fan-out is intentional`,
      );
    }
    if (maxCostUsd !== undefined && spentUsd >= maxCostUsd) {
      throw new WorkflowScriptError(
        `cost budget exhausted ($${spentUsd.toFixed(3)} spent of $${maxCostUsd} maxCostUsd)`,
      );
    }
    spawned += 1;
    const outcome = await options.runner(invocation, runnerSignal);
    spentUsd += outcome.usage?.cost ?? 0;
    return outcome;
  };
  const fallbackJournal = new Map<string, JournalRecord>();
  const journal: WorkflowJournal = options.journal ?? {
    get: (key) => fallbackJournal.get(key),
    put: (key, record) => {
      fallbackJournal.set(key, record);
    },
  };
  const semaphore = new Semaphore(Math.max(1, Math.floor(options.maxConcurrency ?? 8)));

  const progress: WorkflowProgress = {
    currentPhase: undefined,
    phases: (meta.phases ?? []).map((p) => p.title),
    logs: [],
    agents: [],
  };

  const emit = () => {
    options.onProgress?.({
      ...progress,
      phases: [...progress.phases],
      logs: [...progress.logs],
      agents: progress.agents.map((a) => ({ ...a })),
    });
  };

  const occurrences = new Map<string, number>();
  const nextKey = (prompt: string, callOptions: AgentCallOptions): string => {
    const hash = contentHash(prompt, callOptions);
    const seen = occurrences.get(hash) ?? 0;
    occurrences.set(hash, seen + 1);
    return `${hash}#${seen}`;
  };

  const runWithSchema = async (invocation: AgentInvocation): Promise<unknown> => {
    const schema = invocation.options.schema as TSchema;
    const contract =
      `\n\nOutput contract: your ENTIRE final reply must be a single JSON value matching this ` +
      `JSON Schema (no prose, no markdown fences):\n${JSON.stringify(schema)}`;
    let prompt = invocation.prompt + contract;

    let lastProblem = "";
    for (let attempt = 0; attempt < SCHEMA_ATTEMPTS; attempt++) {
      const outcome = await runner({ ...invocation, prompt }, signal);
      const parsed = tryParseJson(outcome.output);
      if (parsed.ok && Check(schema, parsed.value)) return parsed.value;
      lastProblem = parsed.ok ? describeSchemaErrors(schema, parsed.value) : parsed.error;
      prompt =
        invocation.prompt +
        contract +
        `\n\nYour previous reply was invalid (${lastProblem}). Reply again with ONLY the corrected JSON.`;
    }
    throw new Error(
      `agent "${invocation.label}" did not produce JSON matching the schema after ${SCHEMA_ATTEMPTS} attempts (${lastProblem})`,
    );
  };

  const agent = async (prompt: unknown, rawOptions: unknown = {}): Promise<unknown> => {
    if (typeof prompt !== "string" || !prompt.trim()) {
      throw new WorkflowScriptError("agent(prompt, opts?) requires a non-empty string prompt");
    }
    if (signal?.aborted) throw new Error("workflow aborted");
    if (rawOptions && typeof rawOptions === "object" && "isolation" in rawOptions) {
      throw new WorkflowScriptError(
        "agent() no longer supports the isolation option; create an isolated workspace and pass its path with cwd instead",
      );
    }

    const callOptions = (rawOptions ?? {}) as AgentCallOptions satisfies AgentCallOptions;
    const key = nextKey(prompt, callOptions);
    const label = callOptions.label ?? defaultLabel(prompt);
    const status: WorkflowAgentStatus = {
      label,
      phase: callOptions.phase ?? progress.currentPhase,
      status: "queued",
    };
    progress.agents.push(status);

    const cached = journal.get(key);
    if (cached !== undefined) {
      status.status = "cached";
      emit();
      return cached.result;
    }
    emit();

    const invocation: AgentInvocation = {
      prompt,
      label,
      phase: status.phase,
      options: callOptions,
    };

    const release = await semaphore.acquire();
    const startedAt = Date.now();
    status.status = "running";
    emit();
    try {
      const result = callOptions.schema
        ? await runWithSchema(invocation)
        : (await runner(invocation, signal)).output;
      journal.put(key, { result, label });
      status.status = "done";
      status.durationMs = Date.now() - startedAt;
      emit();
      return result;
    } catch (error) {
      status.status = "error";
      status.error = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      status.durationMs = Date.now() - startedAt;
      emit();
      throw error;
    } finally {
      release();
    }
  };

  const parallel = async (thunks: unknown): Promise<unknown[]> => {
    if (!Array.isArray(thunks)) {
      throw new WorkflowScriptError("parallel(thunks) requires an array of () => Promise thunks");
    }
    if (thunks.length > MAX_ITEMS_PER_CALL) {
      throw new WorkflowScriptError(
        `parallel() accepts at most ${MAX_ITEMS_PER_CALL} items (got ${thunks.length})`,
      );
    }
    return Promise.all(
      thunks.map(async (thunk) => {
        try {
          return typeof thunk === "function" ? await thunk() : await thunk;
        } catch {
          return null;
        }
      }),
    );
  };

  const pipeline = async (items: unknown, ...stages: unknown[]): Promise<unknown[]> => {
    if (!Array.isArray(items)) {
      throw new WorkflowScriptError("pipeline(items, ...stages) requires an array of items");
    }
    if (items.length > MAX_ITEMS_PER_CALL) {
      throw new WorkflowScriptError(
        `pipeline() accepts at most ${MAX_ITEMS_PER_CALL} items (got ${items.length})`,
      );
    }
    if (stages.some((stage) => typeof stage !== "function")) {
      throw new WorkflowScriptError("pipeline stages must be functions");
    }
    const stageFns = stages as ((prev: unknown, item: unknown, index: number) => unknown)[];
    return Promise.all(
      items.map(async (item, index) => {
        let acc: unknown = item;
        try {
          for (const stage of stageFns) acc = await stage(acc, item, index);
          return acc;
        } catch {
          return null;
        }
      }),
    );
  };

  const phase = (title: unknown): void => {
    if (typeof title !== "string" || !title.trim()) return;
    progress.currentPhase = title;
    if (!progress.phases.includes(title)) progress.phases.push(title);
    emit();
  };

  const log = (message: unknown): void => {
    const text = typeof message === "string" ? message : stableStringify(message);
    progress.logs.push(text);
    if (progress.logs.length > MAX_LOG_LINES) progress.logs.shift();
    emit();
  };

  const budget = {
    total: maxCostUsd ?? null,
    spent: () => Number(spentUsd.toFixed(4)),
    remaining: () =>
      maxCostUsd === undefined ? Infinity : Number(Math.max(0, maxCostUsd - spentUsd).toFixed(4)),
  };

  const sandbox = {
    agent,
    parallel,
    pipeline,
    phase,
    log,
    budget,
    args: options.args,
    console: {
      log,
      info: log,
      warn: log,
      error: log,
    },
  };

  const context = createContext(sandbox);
  runInContext(PRELUDE, context, { filename: "workflow:prelude" });

  let compiled: Script;
  try {
    compiled = new Script(`(async () => {\n${body}\n})()`, {
      filename: `workflow:${meta.name}`,
    });
  } catch (error) {
    throw new WorkflowScriptError(
      `workflow script has a syntax error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result: unknown = await compiled.runInContext(context);
  emit();
  return { meta, result, progress };
}
