import * as path from "node:path";

import { StringEnum } from "@earendil-works/pi-ai";
import {
  defineTool,
  type ExtensionAPI,
  type ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { loadAgentRouterConfig } from "./config";
import { parseRouteCommandArgs } from "./command-args";
import {
  DEFAULT_DELEGATE_TIMEOUT_MS,
  runDelegatedAgentWork,
  type DelegatedAgentRun,
} from "./delegate";
import { matchesAny, normalizeRepoPath } from "./path-policy";
import { renderRoutingDecision, renderRoutingDecisionLines } from "./render";
import { routeAgentTask } from "./route-task";
import { createSafeBashTool } from "./safe-bash";
import type {
  AgentIntent,
  DelegateMode,
  RouteTaskDelegationOptions,
  ProtectedPathPolicy,
  RouteTaskInput,
  RoutedAgentWork,
  RoutingDecision,
} from "./types";

const activeRouteEntryType = "agent-router-active-route";

const intentValues = ["feature", "bugfix", "refactor", "quality", "docs"] as const;

const delegateModeValues = ["primary", "all"] as const;
const delegatedDepthEnvName = "PI_AGENT_ROUTER_DELEGATE_DEPTH";

interface ActiveRoute {
  readonly task: RouteTaskInput;
  readonly decision: RoutingDecision;
  readonly allowedEditPaths: readonly string[];
  readonly source: "tool" | "command";
  readonly setAt: number;
}

interface ActiveRouteEntryData {
  readonly activeRoute: ActiveRoute | null;
}

interface DelegationOutcome {
  readonly requested: boolean;
  readonly mode: DelegateMode;
  readonly runs: readonly DelegatedAgentRun[];
  readonly skippedReason?: string;
}

export default function agentRouterExtension(pi: ExtensionAPI) {
  let activeRoute: ActiveRoute | undefined;
  let routeEnforcementEnabled = false;

  function setActiveRoute(
    task: RouteTaskInput,
    decision: RoutingDecision,
    source: ActiveRoute["source"],
    ctx?: ExtensionContext,
  ): ActiveRoute {
    const nextRoute: ActiveRoute = {
      task,
      decision,
      allowedEditPaths: getAllowedEditPaths(decision),
      source,
      setAt: Date.now(),
    };
    activeRoute = nextRoute;
    pi.appendEntry<ActiveRouteEntryData>(activeRouteEntryType, {
      activeRoute: nextRoute,
    });
    updateRouteUi(ctx);
    return nextRoute;
  }

  function clearActiveRoute(ctx?: ExtensionContext): void {
    activeRoute = undefined;
    pi.appendEntry<ActiveRouteEntryData>(activeRouteEntryType, {
      activeRoute: null,
    });
    updateRouteUi(ctx);
  }

  function updateRouteUi(ctx?: ExtensionContext): void {
    if (!ctx) return;

    if (!routeEnforcementEnabled) {
      ctx.ui.setStatus("agent-router", "route: soft fallback");
      return;
    }

    const route = activeRoute;
    if (!route) {
      ctx.ui.setStatus("agent-router", "route: none");
      return;
    }

    const routeLabel = route.decision.primaryAgentId ?? route.decision.kind;
    ctx.ui.setStatus("agent-router", `route: ${routeLabel}`);
  }

  const routeAgentTaskTool = defineTool({
    name: "route_agent_task",
    label: "Route agent task",
    description:
      "Route a repo task to the appropriate specialized Pi agent(s), including protected-path checks, delegation prompts, and optional automatic child-agent spawning. In configured repos, calling this tool sets the active edit route enforced by write/edit tools.",
    promptSnippet:
      "In repos with .pi/agent-router.config.ts, set the active edit route before writing or editing files by declaring planned editPaths/readPaths.",
    promptGuidelines: [
      "In configured repos, call route_agent_task before the first write or edit tool call in a task, passing the planned editPaths and useful readPaths.",
      "In configured repos, write/edit tool calls are blocked until route_agent_task sets an active route, and remain limited to that route's allowed edit paths.",
      "If the needed edit scope changes in a configured repo, call route_agent_task again with revised editPaths/readPaths before editing outside the current route.",
      "In repos without .pi/agent-router.config.ts, Agent Router runs in soft fallback mode: routing is advisory, auto-delegation is disabled, and normal write/edit behavior is not route-gated.",
    ],
    parameters: Type.Object({
      title: Type.String({ description: "Short task title." }),
      description: Type.Optional(Type.String({ description: "Additional task context." })),
      intent: StringEnum(intentValues, { description: "Task intent." }),
      editPaths: Type.Array(Type.String(), {
        description: "Repo-relative paths the task may edit.",
      }),
      readPaths: Type.Optional(
        Type.Array(Type.String(), {
          description: "Repo-relative paths needed as read-only context.",
        }),
      ),
      acceptanceCriteria: Type.Optional(
        Type.Array(Type.String(), {
          description: "Acceptance criteria for delegated agents.",
        }),
      ),
      delegateMode: Type.Optional(
        StringEnum(delegateModeValues, {
          description: "Which routed work to spawn automatically. Defaults to primary.",
        }),
      ),
      delegateTimeoutMs: Type.Optional(
        Type.Number({
          description: `Timeout per delegated Pi child process in milliseconds. Default: ${DEFAULT_DELEGATE_TIMEOUT_MS}.`,
        }),
      ),
      delegateModel: Type.Optional(
        Type.String({
          description: "Optional Pi model pattern/id for delegated child processes.",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "Agent routing cancelled." }],
          details: { cancelled: true },
        };
      }

      const task = normalizeTaskParams(params);
      const config = await loadAgentRouterConfig(ctx.cwd);
      routeEnforcementEnabled = config.isRepoConfigured;
      const decision = routeAgentTask(task, config.agents, config.protectedPathPolicies);
      const route = setActiveRoute(task, decision, "tool", ctx);
      const summary = renderRoutingDecision(task, decision);
      const delegationPrompts = decision.agentWork.map((work) => ({
        agentId: work.agentId,
        role: work.role,
        prompt: work.delegationPrompt,
      }));
      const subagentInvocations = decision.agentWork.map((work) => ({
        agentId: work.agentId,
        role: work.role,
        invocation: work.subagentInvocation,
      }));
      const delegation = await maybeDelegateWork({
        decision,
        options: normalizeDelegationOptions(params, config.isRepoConfigured),
        cwd: ctx.cwd,
        signal,
        onUpdate: (text) => {
          onUpdate?.({
            content: [{ type: "text", text }],
            details: { task, decision, activeRoute: route },
          });
        },
      });

      return {
        content: [
          {
            type: "text",
            text: [
              summary,
              "",
              renderActiveRouteSummary(route, config.isRepoConfigured),
              "",
              "## Subagent invocation snippets",
              ...subagentInvocations.map(formatSubagentInvocation),
              "",
              "## Delegation prompts",
              ...delegationPrompts.map(formatDelegationPrompt),
              ...(delegation.requested
                ? ["", "## Auto-delegation", formatDelegationOutcome(delegation)]
                : []),
            ].join("\n"),
          },
        ],
        details: {
          task,
          decision,
          delegationPrompts,
          subagentInvocations,
          activeRoute: route,
          delegation,
        },
      };
    },
  });

  pi.registerTool(routeAgentTaskTool);
  pi.registerTool(createSafeBashTool());

  pi.registerCommand("route-agent", {
    description:
      'Route paths to specialized repo agents. Use "status" to show the active route or "clear" to clear it. Example: /route-agent --title "Fix refund" --intent bugfix --edit apps/fluid-admin/pages/orders/[id].tsx,packages/orders/core/src/refunds.ts',
    getArgumentCompletions: (prefix) => {
      const options = [
        "status",
        "clear",
        "--title",
        "--description",
        "--intent",
        "--edit",
        "--read",
        "--accept",
        "--delegate-all",
        "--delegate-mode",
        "--delegate-timeout-ms",
        "--delegate-model",
      ];
      const matches = options.filter((option) => option.startsWith(prefix));
      return matches.length > 0 ? matches.map((value) => ({ value, label: value })) : null;
    },
    handler: async (args, ctx) => {
      const command = args.trim();

      if (command === "status") {
        const lines = renderActiveRouteStatus(activeRoute, routeEnforcementEnabled);
        ctx.ui.setWidget("agent-router", lines);
        ctx.ui.notify(lines.join("\n"), activeRoute ? "info" : "warning");
        updateRouteUi(ctx);
        return;
      }

      if (command === "clear") {
        clearActiveRoute(ctx);
        ctx.ui.setWidget(
          "agent-router",
          renderActiveRouteStatus(undefined, routeEnforcementEnabled),
        );
        ctx.ui.notify(
          routeEnforcementEnabled
            ? "Agent route cleared. write/edit will require route_agent_task before edits."
            : "Agent route cleared. Soft fallback mode remains active because no .pi/agent-router.config.ts exists.",
          "info",
        );
        return;
      }

      try {
        const parsed = parseRouteCommandArgs(args);
        const { task } = parsed;
        const config = await loadAgentRouterConfig(ctx.cwd);
        routeEnforcementEnabled = config.isRepoConfigured;
        const decision = routeAgentTask(task, config.agents, config.protectedPathPolicies);
        const route = setActiveRoute(task, decision, "command", ctx);
        ctx.ui.setWidget("agent-router", renderRoutingDecisionLines(task, decision));
        ctx.ui.notify(
          config.isRepoConfigured
            ? `Routed task: ${decision.kind}. Active edit paths: ${formatPathList(route.allowedEditPaths)}.`
            : `Routed task: ${decision.kind}. Soft fallback mode: edit enforcement and auto-delegation are disabled because no .pi/agent-router.config.ts exists.`,
          decision.kind === "blocked" ? "warning" : "info",
        );

        const delegation = await maybeDelegateWork({
          decision,
          options: normalizeDelegationOptions(parsed.delegation, config.isRepoConfigured),
          cwd: ctx.cwd,
        });
        if (delegation.requested) {
          ctx.ui.notify(formatDelegationOutcome(delegation), "info");
        }
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : "Failed to route task.", "error");
      }
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    activeRoute = restoreActiveRoute(ctx);
    const config = await loadAgentRouterConfig(ctx.cwd);
    routeEnforcementEnabled = config.isRepoConfigured;
    updateRouteUi(ctx);
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const config = await loadAgentRouterConfig(ctx.cwd);
    routeEnforcementEnabled = config.isRepoConfigured;
    return {
      systemPrompt: `${event.systemPrompt}

${renderRouteSystemGuidance(activeRoute, routeEnforcementEnabled)}`,
    };
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return undefined;

    const toolPath =
      typeof event.input.path === "string"
        ? getCanonicalToolPath(event.input.path, ctx.cwd)
        : undefined;
    if (!toolPath) return undefined;

    if (toolPath.outsideCwd) {
      return {
        block: true,
        reason: `Agent Router blocked ${event.toolName} for ${toolPath.displayPath}: path resolves outside ${ctx.cwd}.`,
      };
    }

    const config = await loadAgentRouterConfig(ctx.cwd);
    routeEnforcementEnabled = config.isRepoConfigured;
    const protectedReason = getProtectedPathBlockReason(
      toolPath.repoPath,
      config.protectedPathPolicies,
    );
    if (protectedReason) {
      return {
        block: true,
        reason: protectedReason,
      };
    }

    if (!routeEnforcementEnabled) {
      ctx.ui.setStatus("agent-router", "route: soft fallback");
      return;
    }

    const route = activeRoute;
    if (!route) {
      return {
        block: true,
        reason: [
          `Agent Router blocked ${event.toolName} for ${toolPath.repoPath}: no active route is set.`,
          "Call route_agent_task first with the planned editPaths and readPaths, then retry the edit after the route is active.",
          "Use /route-agent status to inspect the current route.",
        ].join("\n"),
      };
    }

    if (!isAllowedByActiveRoute(toolPath.repoPath, route)) {
      return {
        block: true,
        reason: [
          `Agent Router blocked ${event.toolName} for ${toolPath.repoPath}: outside the active route's allowed edit paths.`,
          `Active route: ${route.task.title} (${route.decision.kind}).`,
          `Allowed edit paths: ${formatPathList(route.allowedEditPaths)}.`,
          "Call route_agent_task again with revised editPaths/readPaths if this edit is intentional.",
        ].join("\n"),
      };
    }

    return undefined;
  });
}

async function maybeDelegateWork(input: {
  readonly decision: RoutingDecision;
  readonly options: RouteTaskDelegationOptions;
  readonly cwd: string;
  readonly signal?: AbortSignal;
  readonly onUpdate?: (text: string) => void;
}): Promise<DelegationOutcome> {
  const mode = input.options.delegateMode ?? "primary";
  if (!input.options.delegate) {
    return { requested: false, mode, runs: [] };
  }

  if (input.decision.kind === "blocked") {
    return {
      requested: true,
      mode,
      runs: [],
      skippedReason: "route is blocked; no delegated agents were spawned",
    };
  }

  const targets = getDelegationTargets(input.decision, mode);
  if (targets.length === 0) {
    return {
      requested: true,
      mode,
      runs: [],
      skippedReason: "route produced no agent work to delegate",
    };
  }

  const runs: DelegatedAgentRun[] = [];
  for (const work of targets) {
    if (input.signal?.aborted) break;

    input.onUpdate?.(`Auto-delegation starting: ${work.agentId} (${work.role})`);
    const run = await runDelegatedAgentWork(work, {
      cwd: input.cwd,
      model: input.options.delegateModel,
      timeoutMs: input.options.delegateTimeoutMs,
      signal: input.signal,
      onUpdate: (agentId, text) => {
        input.onUpdate?.([`Auto-delegation update: ${agentId}`, "", text].join("\n"));
      },
    });
    runs.push(run);
    input.onUpdate?.(`Auto-delegation finished: ${work.agentId} exit=${run.exitCode ?? "unknown"}`);
  }

  return { requested: true, mode, runs };
}

function getDelegationTargets(
  decision: RoutingDecision,
  mode: DelegateMode,
): readonly RoutedAgentWork[] {
  if (mode === "all") return decision.agentWork;

  const primary = decision.agentWork.find(
    (work) => work.role === "primary" || work.agentId === decision.primaryAgentId,
  );
  return primary ? [primary] : decision.agentWork.slice(0, 1);
}

function normalizeDelegationOptions(
  params: RouteTaskDelegationOptions,
  isRepoConfigured: boolean,
): RouteTaskDelegationOptions {
  if (!isRepoConfigured || isDelegatedChildProcess()) {
    return {
      delegate: false,
      delegateMode: params.delegateMode ?? "primary",
      delegateTimeoutMs: normalizePositiveNumber(params.delegateTimeoutMs),
      delegateModel: normalizeOptionalString(params.delegateModel),
    };
  }

  return {
    delegate: true,
    delegateMode: params.delegateMode ?? "primary",
    delegateTimeoutMs: normalizePositiveNumber(params.delegateTimeoutMs),
    delegateModel: normalizeOptionalString(params.delegateModel),
  };
}

function isDelegatedChildProcess(): boolean {
  const depth = Number(process.env[delegatedDepthEnvName] ?? "0");
  return Number.isFinite(depth) && depth > 0;
}

function normalizePositiveNumber(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (isPositiveNumber(value)) return value;
  throw new Error("delegateTimeoutMs must be a positive number.");
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeTaskParams(params: {
  readonly title: string;
  readonly description?: string;
  readonly intent: AgentIntent;
  readonly editPaths: readonly string[];
  readonly readPaths?: readonly string[];
  readonly acceptanceCriteria?: readonly string[];
}): RouteTaskInput {
  return {
    title: params.title,
    description: params.description,
    intent: params.intent,
    editPaths: params.editPaths,
    readPaths: params.readPaths,
    acceptanceCriteria: params.acceptanceCriteria,
  };
}

function getAllowedEditPaths(decision: RoutingDecision): string[] {
  return Array.from(
    new Set(decision.agentWork.flatMap((work) => work.editPaths.map(normalizeRepoPath))),
  );
}

function getProtectedPathBlockReason(
  path: string,
  policies: readonly ProtectedPathPolicy[],
): string | undefined {
  const policy = policies.find((candidate) => matchesAny(candidate.patterns, path));
  if (!policy) return undefined;
  return `${path} is protected by ${policy.label}: ${policy.reason}`;
}

function getCanonicalToolPath(
  inputPath: string,
  cwd: string,
):
  | {
      readonly repoPath: string;
      readonly displayPath: string;
      readonly outsideCwd: false;
    }
  | {
      readonly displayPath: string;
      readonly outsideCwd: true;
    } {
  const absoluteCwd = path.resolve(cwd);
  const absolutePath = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(absoluteCwd, inputPath);
  const relativePath = path.relative(absoluteCwd, absolutePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return {
      displayPath: normalizeRepoPath(relativePath),
      outsideCwd: true,
    };
  }

  return {
    repoPath: normalizeRepoPath(relativePath || "."),
    displayPath: normalizeRepoPath(relativePath || "."),
    outsideCwd: false,
  };
}

function isAllowedByActiveRoute(path: string, route: ActiveRoute): boolean {
  return route.allowedEditPaths.some((allowedPath) => isAllowedEditPathMatch(allowedPath, path));
}

function isAllowedEditPathMatch(allowedPath: string, path: string): boolean {
  const normalizedAllowedPath = normalizeRepoPath(allowedPath);
  const normalizedPath = normalizeRepoPath(path);
  const allowedPathWithoutTrailingSlash = normalizedAllowedPath.replace(/\/$/, "");

  if (normalizedPath === allowedPathWithoutTrailingSlash) return true;
  if (matchesAny([normalizedAllowedPath], normalizedPath)) return true;
  if (normalizedAllowedPath.includes("*")) return false;
  return normalizedPath.startsWith(`${allowedPathWithoutTrailingSlash}/`);
}

function restoreActiveRoute(ctx: ExtensionContext): ActiveRoute | undefined {
  const entry = ctx.sessionManager.getEntries().filter(isActiveRouteEntry).pop();

  if (!entry) return undefined;
  return entry.data.activeRoute ?? undefined;
}

function isActiveRouteEntry(entry: unknown): entry is {
  readonly type: "custom";
  readonly customType: typeof activeRouteEntryType;
  readonly data: ActiveRouteEntryData;
} {
  if (!isRecord(entry)) return false;
  if (entry.type !== "custom") return false;
  if (entry.customType !== activeRouteEntryType) return false;
  if (!isRecord(entry.data)) return false;
  return entry.data.activeRoute === null || isActiveRoute(entry.data.activeRoute);
}

function isActiveRoute(value: unknown): value is ActiveRoute {
  if (!isRecord(value)) return false;
  if (!isRecord(value.task)) return false;
  if (!isRecord(value.decision)) return false;
  if (!Array.isArray(value.allowedEditPaths)) return false;
  if (value.source !== "tool" && value.source !== "command") return false;
  return typeof value.setAt === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function renderActiveRouteSummary(route: ActiveRoute, isRepoConfigured: boolean): string {
  if (!isRepoConfigured) {
    return [
      "## Agent Router soft fallback mode",
      `Source: ${route.source}`,
      `Suggested edit paths: ${formatPathList(route.allowedEditPaths)}`,
      "No .pi/agent-router.config.ts was found, so write/edit route enforcement and auto-delegation are disabled. Built-in protected paths such as .git/** and node_modules/** remain blocked.",
    ].join("\n");
  }

  return [
    "## Active route enforcement",
    `Source: ${route.source}`,
    `Allowed edit paths: ${formatPathList(route.allowedEditPaths)}`,
    "write/edit calls outside these paths are blocked until route_agent_task is called again or /route-agent clear is used.",
  ].join("\n");
}

function renderActiveRouteStatus(
  route: ActiveRoute | undefined,
  isRepoConfigured: boolean,
): string[] {
  if (!route) {
    if (!isRepoConfigured) {
      return [
        "Agent route: none",
        "Soft fallback mode: no .pi/agent-router.config.ts found.",
        "write/edit route enforcement and auto-delegation are disabled; built-in protected paths remain blocked.",
      ];
    }

    return [
      "Agent route: none",
      "write/edit is blocked until route_agent_task sets an active route.",
      "Call route_agent_task with planned editPaths/readPaths before editing.",
    ];
  }

  return [
    `Agent route: ${route.task.title}`,
    `Source: ${route.source}`,
    `Kind: ${route.decision.kind}`,
    route.decision.primaryAgentId ? `Primary: ${route.decision.primaryAgentId}` : "Primary: none",
    `Allowed edit paths: ${formatPathList(route.allowedEditPaths)}`,
    `Blocked reasons: ${formatPathList(route.decision.blockedReasons)}`,
    isRepoConfigured
      ? "Hard-protected paths are always blocked."
      : "Soft fallback mode: active routes are advisory only; built-in protected paths remain blocked.",
  ];
}

function renderRouteSystemGuidance(
  route: ActiveRoute | undefined,
  isRepoConfigured: boolean,
): string {
  if (!isRepoConfigured) {
    return [
      "[Agent Router Soft Fallback]",
      "No .pi/agent-router.config.ts was found for this repo. Normal write/edit behavior is not route-gated, and route_agent_task will not auto-delegate by default.",
      "Built-in protected paths such as .git/** and node_modules/** remain blocked.",
    ].join("\n");
  }

  if (!route) {
    return [
      "[Agent Router Enforcement]",
      "No active edit route is set. Before using write or edit, call route_agent_task with the planned editPaths and any readPaths needed for context.",
      "Hard-protected paths remain blocked even after routing. Use /route-agent status to inspect route state.",
    ].join("\n");
  }

  return [
    "[Agent Router Enforcement]",
    `Active route: ${route.task.title} (${route.decision.kind}).`,
    `Allowed edit paths for write/edit: ${formatPathList(route.allowedEditPaths)}.`,
    "Before editing any other path, call route_agent_task again with revised editPaths/readPaths. Hard-protected paths remain blocked.",
  ].join("\n");
}

function formatPathList(paths: readonly string[]): string {
  if (paths.length === 0) return "none";
  return paths.join(", ");
}

function formatDelegationOutcome(outcome: DelegationOutcome): string {
  const lines = [`Mode: ${outcome.mode}`];
  if (outcome.skippedReason) lines.push(`Skipped: ${outcome.skippedReason}`);
  if (outcome.runs.length === 0) {
    lines.push("Runs: none");
    return lines.join("\n");
  }

  lines.push("Runs:");
  for (const run of outcome.runs) {
    lines.push(
      `- ${run.agentId} (${run.role}): exit=${run.exitCode ?? "unknown"} duration=${formatDuration(run.durationMs)}`,
    );
    if (run.finalOutput.trim()) {
      lines.push(indentBlock(truncateLines(run.finalOutput.trim(), 24), "  "));
    }
    if (run.stderr.trim()) {
      lines.push("  stderr:");
      lines.push(indentBlock(truncateLines(run.stderr.trim(), 12), "    "));
    }
  }
  return lines.join("\n");
}

function formatDuration(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function truncateLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return [...lines.slice(0, maxLines), `… truncated ${lines.length - maxLines} line(s)`].join("\n");
}

function indentBlock(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function formatDelegationPrompt(input: {
  readonly agentId: string;
  readonly role: string;
  readonly prompt: string;
}): string {
  return [`### ${input.agentId} (${input.role})`, "", "```md", input.prompt, "```"].join("\n");
}

function formatSubagentInvocation(input: {
  readonly agentId: string;
  readonly role: string;
  readonly invocation: unknown;
}): string {
  return [
    `### ${input.agentId} (${input.role})`,
    "",
    "```json",
    JSON.stringify(input.invocation, null, 2),
    "```",
  ].join("\n");
}
