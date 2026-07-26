import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { cpus } from "node:os";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { emptyUsage, type AgentUsage } from "../lib/agent-process.js";
import { DEFAULT_TIMEOUT_MS, runSubagent } from "../subagent/runner.js";
import {
  runWorkflowScript,
  WorkflowScriptError,
  type AgentRunner,
  type WorkflowProgress,
} from "./host.js";
import {
  loadJournalRecords,
  loadPersistedScript,
  persistScript,
  SessionJournal,
} from "./journal.js";
import { renderWorkflowCall } from "./ui.js";

const MAX_RESULT_CHARS = 40_000;
const PROGRESS_UPDATE_INTERVAL_MS = 150;

const WorkflowParams = Type.Object({
  script: Type.Optional(
    Type.String({
      description:
        "Workflow script source. Must begin with `export const meta = { name, description, phases? }` (pure literal), followed by a body that may use top-level await/return.",
    }),
  ),
  scriptPath: Type.Optional(
    Type.String({
      description: "Path to a workflow script file, as an alternative to `script`.",
    }),
  ),
  args: Type.Optional(
    Type.Any({
      description: "Value exposed to the script as the global `args`, verbatim.",
    }),
  ),
  resumeFromRunId: Type.Optional(
    Type.String({
      description:
        "Run id of a prior workflow invocation in this session. Journaled agent() results for unchanged (prompt, opts) calls are reused instead of re-running.",
    }),
  ),
  model: Type.Optional(
    Type.String({
      description:
        "Default pi model pattern/id for spawned agents. OMIT to use the session's default model, which is almost always correct.",
    }),
  ),
  maxConcurrency: Type.Optional(
    Type.Number({
      description: "Maximum concurrently running agents. Default: min(8, CPU cores - 2).",
    }),
  ),
  agentTimeoutMs: Type.Optional(
    Type.Number({
      description: `Per-agent timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.`,
    }),
  ),
});

export interface WorkflowDetails {
  runId: string;
  name?: string;
  description?: string;
  progress?: WorkflowProgress;
  usage: AgentUsage;
  agentsSpawned: number;
}

const STATUS_ICONS: Record<string, string> = {
  queued: "…",
  running: "▶",
  done: "✔",
  cached: "↻",
  error: "✖",
};

function renderProgressText(progress: WorkflowProgress): string {
  const lines: string[] = [];
  const byPhase = new Map<string, typeof progress.agents>();
  for (const agent of progress.agents) {
    const phase = agent.phase ?? "";
    const bucket = byPhase.get(phase) ?? [];
    bucket.push(agent);
    byPhase.set(phase, bucket);
  }

  const phaseOrder = [...progress.phases];
  if (byPhase.has("") && !phaseOrder.includes("")) phaseOrder.push("");

  for (const phase of phaseOrder) {
    const agents = byPhase.get(phase) ?? [];
    if (phase) lines.push(`${phase}:`);
    for (const agent of agents) {
      const icon = STATUS_ICONS[agent.status] ?? "?";
      const duration =
        agent.durationMs !== undefined ? ` (${(agent.durationMs / 1000).toFixed(1)}s)` : "";
      lines.push(`${phase ? "  " : ""}${icon} ${agent.label}${duration}`);
    }
  }

  for (const logLine of progress.logs.slice(-3)) lines.push(`· ${logLine}`);
  return lines.join("\n") || "(starting workflow...)";
}

function formatUsage(usage: AgentUsage): string {
  const parts: string[] = [];
  if (usage.turns) parts.push(`${usage.turns} turns`);
  if (usage.input) parts.push(`↑${usage.input}`);
  if (usage.output) parts.push(`↓${usage.output}`);
  if (usage.cost) parts.push(`$${usage.cost.toFixed(3)}`);
  return parts.length ? parts.join(" ") : "no usage recorded";
}

function serializeResult(result: unknown): string {
  if (result === undefined) return "(no return value)";
  if (typeof result === "string") return result;
  let json: string;
  try {
    json = JSON.stringify(result, null, 2) ?? String(result);
  } catch {
    json = String(result);
  }
  if (json.length > MAX_RESULT_CHARS) {
    return `${json.slice(0, MAX_RESULT_CHARS)}\n[workflow: result truncated at ${MAX_RESULT_CHARS} chars]`;
  }
  return json;
}

export default function workflow(pi: ExtensionAPI) {
  const appendEntry = pi.appendEntry.bind(pi);

  pi.registerTool({
    name: "workflow",
    label: "Workflow",
    description: [
      "Execute a JavaScript workflow script that orchestrates multiple subagents deterministically (fan-out, barriers, per-item pipelines) while keeping the main context clean.",
      "",
      "The script MUST begin with `export const meta = { name, description, phases?: [{ title, detail? }] }` as a pure literal. The body runs in an async context (top-level await and return are allowed) with these injected globals:",
      "- agent(prompt, opts?): Promise<string|object> — spawn one isolated subagent. opts: { label?, phase?, model?, tools?, cwd?, timeoutMs?, schema? }. Always OMIT model unless the user asked for a specific one — spawned agents inherit the session default. With schema (a JSON Schema object), the reply is parsed and validated, and agent() returns the object.",
      "- parallel(thunks): Promise<any[]> — run [() => agent(...), ...] concurrently and await all; a failed thunk resolves to null (filter with .filter(Boolean)).",
      "- pipeline(items, ...stages): Promise<any[]> — run each item through the stages independently with NO barrier between stages. Each stage receives (prevResult, originalItem, index); a throwing stage drops that item to null. Prefer this over parallel-per-stage for multi-stage work.",
      "- phase(title): group subsequent agents in the progress display. log(message): emit a progress note. args: the `args` input, verbatim.",
      "",
      "Rules: scripts have no filesystem, network, or Node APIs — subagents do that work. Date.now(), Math.random(), and argless new Date() throw (they would break deterministic resume); pass timestamps or seeds via args. Subagents share no context: every prompt must be self-contained (repo paths, file allowlists, constraints, expected output format).",
      "Every agent() result is journaled under the returned runId. To resume after a failure or script edit, call workflow again with resumeFromRunId (same session): unchanged (prompt, opts) calls return cached results instantly.",
    ].join("\n"),
    promptSnippet:
      "Run a deterministic multi-agent workflow script: fan out subagents with agent()/parallel()/pipeline(), journaled for resume.",
    promptGuidelines: [
      "Use workflow (not repeated subagent calls) when orchestrating 3+ subagents or any multi-stage fan-out; write the control flow as a script so it runs without round-trips through your context.",
      "Workflow scripts must be self-contained: subagents cannot see the conversation, so bake all context into each agent() prompt.",
      "If a workflow fails partway, fix the script and re-run with resumeFromRunId to reuse completed agent results.",
    ],
    parameters: WorkflowParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const runId = params.resumeFromRunId ?? `wf_${randomUUID().slice(0, 12)}`;
      const usage = emptyUsage();
      let agentsSpawned = 0;

      const fail = (message: string) => ({
        content: [{ type: "text" as const, text: message }],
        isError: true,
        details: { runId, usage, agentsSpawned } satisfies WorkflowDetails,
      });

      let script = params.script;
      let scriptArgs: unknown = params.args;
      try {
        if (!script && params.scriptPath) {
          script = await readFile(resolve(ctx.cwd, params.scriptPath), "utf8");
        }
      } catch (error) {
        return fail(
          `Could not read scriptPath: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (!script && params.resumeFromRunId) {
        const persisted = loadPersistedScript(ctx, params.resumeFromRunId);
        if (persisted) {
          script = persisted.script;
          scriptArgs = params.args ?? persisted.args;
        }
      }
      if (!script) {
        return fail(
          "Provide `script`, `scriptPath`, or a `resumeFromRunId` whose script was persisted in this session.",
        );
      }

      persistScript(appendEntry, runId, script, scriptArgs);
      const previousRecords = params.resumeFromRunId
        ? loadJournalRecords(ctx, params.resumeFromRunId)
        : undefined;
      const journal = new SessionJournal(runId, appendEntry, previousRecords);

      const runner: AgentRunner = async (invocation, runnerSignal) => {
        agentsSpawned += 1;
        const details = await runSubagent({
          task: invocation.prompt,
          cwd: invocation.options.cwd ? resolve(ctx.cwd, invocation.options.cwd) : ctx.cwd,
          model: invocation.options.model ?? params.model,
          tools: invocation.options.tools,
          timeoutMs: invocation.options.timeoutMs ?? params.agentTimeoutMs ?? DEFAULT_TIMEOUT_MS,
          signal: runnerSignal,
        });
        usage.input += details.usage.input;
        usage.output += details.usage.output;
        usage.cacheRead += details.usage.cacheRead;
        usage.cacheWrite += details.usage.cacheWrite;
        usage.cost += details.usage.cost;
        usage.turns += details.usage.turns;
        if (details.exitCode !== 0) {
          const reason = (details.stderr || details.finalOutput || "no output").slice(0, 2_000);
          throw new Error(
            `subagent "${invocation.label}" failed (exit ${details.exitCode}): ${reason}`,
          );
        }
        return { output: details.finalOutput, usage: details.usage };
      };

      let name: string | undefined;
      let description: string | undefined;
      let lastUpdate = 0;
      const onProgress = (progress: WorkflowProgress) => {
        const now = Date.now();
        if (now - lastUpdate < PROGRESS_UPDATE_INTERVAL_MS) return;
        lastUpdate = now;
        onUpdate?.({
          content: [{ type: "text", text: renderProgressText(progress) }],
          details: {
            runId,
            name,
            description,
            progress,
            usage,
            agentsSpawned,
          } satisfies WorkflowDetails,
        });
      };

      try {
        const outcome = await runWorkflowScript({
          script,
          args: scriptArgs,
          runner,
          journal,
          onProgress,
          signal,
          maxConcurrency: params.maxConcurrency ?? Math.max(1, Math.min(8, cpus().length - 2)),
        });
        name = outcome.meta.name;
        description = outcome.meta.description;

        const agents = outcome.progress.agents;
        const cached = agents.filter((a) => a.status === "cached").length;
        const errored = agents.filter((a) => a.status === "error").length;
        const usageText =
          agentsSpawned === 0 && cached > 0 ? "$0.000 (all cached)" : formatUsage(usage);
        const errorLines = agents
          .filter((a) => a.status === "error")
          .slice(0, 5)
          .map((a) => `  ✖ ${a.label}: ${a.error ?? "unknown error"}`);
        if (errored > errorLines.length) {
          errorLines.push(`  … and ${errored - errorLines.length} more`);
        }
        const summary = [
          `Workflow "${outcome.meta.name}" finished (runId: ${runId}).`,
          `Agents: ${agents.length} total — ${agentsSpawned} run, ${cached} cached, ${errored} errored. Usage: ${usageText}.`,
          ...(errored > 0
            ? [
                "Agent errors (their results are null/missing — treat the result below as incomplete):",
                ...errorLines,
              ]
            : []),
          "",
          "Result:",
          serializeResult(outcome.result),
        ].join("\n");

        return {
          content: [{ type: "text", text: summary }],
          details: {
            runId,
            name,
            description,
            progress: outcome.progress,
            usage,
            agentsSpawned,
          } satisfies WorkflowDetails,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const hint =
          error instanceof WorkflowScriptError
            ? ""
            : `\n\nCompleted agent results are journaled; fix the script and re-run with resumeFromRunId: "${runId}" to reuse them.`;
        return fail(`Workflow failed: ${message}${hint}`);
      }
    },

    renderCall(args, theme) {
      return renderWorkflowCall(args as Record<string, unknown>, theme);
    },
  });
}
