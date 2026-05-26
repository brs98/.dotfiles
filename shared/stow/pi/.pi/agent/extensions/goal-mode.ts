import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import {
  applyGoalBudget,
  BLOCKED_THRESHOLD,
  buildGoalContext,
  clearBlockerStreak,
  createGoalState,
  editGoalObjective,
  extractUsageTokens,
  formatGoalStatus,
  GOAL_CONTEXT_MESSAGE,
  GOAL_STATE_ENTRY,
  handleBlockedUpdate,
  nowMs,
  parseTokenBudget,
  restoreLatestGoalState,
  setGoalStatus,
  setTokenBudget,
  shouldInjectGoal,
  updateTokenUsage,
  type GoalState,
  type GoalStateEntry,
  type GoalUpdateStatus,
  type SessionEntryLike,
} from "./lib/goal-mode-state.js";

type GoalUpdateParams = {
  status: GoalUpdateStatus;
  evidence: string;
  remainingWork?: string;
  blockerSummary?: string;
};

const GoalUpdateParamsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "evidence"],
  properties: {
    status: {
      type: "string",
      enum: ["complete", "blocked"],
      description:
        "Set to complete only when the full objective is verified done. Set to blocked only after the same blocker repeats for at least three consecutive goal turns.",
    },
    evidence: {
      type: "string",
      description:
        "Current evidence for the status change. Required; do not claim completion or blockage without evidence.",
    },
    remainingWork: {
      type: "string",
      description: "Remaining work, especially when reporting a blocker.",
    },
    blockerSummary: {
      type: "string",
      description: "Stable summary of the repeated blocker when status is blocked.",
    },
  },
} as const;

function shortObjective(objective: string): string {
  return objective.length > 64 ? `${objective.slice(0, 61)}...` : objective;
}

function goalWorkPrompt(goal: GoalState, reason: "set" | "edit" | "resume"): string {
  const verb = reason === "resume" ? "Continue" : "Start";
  return `${verb} working toward the active Pi session goal:\n\n${goal.objective}`;
}

const GOAL_SUBCOMMAND_COMPLETIONS: AutocompleteItem[] = [
  { value: "set ", label: "set <objective>", description: "Set a goal and immediately start work" },
  { value: "edit", label: "edit", description: "Edit the current goal and resume work" },
  { value: "status", label: "status", description: "Show objective, status, usage, and blockers" },
  { value: "pause", label: "pause", description: "Pause goal context injection" },
  {
    value: "resume",
    label: "resume",
    description: "Resume the goal and immediately continue work",
  },
  { value: "clear", label: "clear", description: "Clear the session goal" },
  { value: "done", label: "done", description: "Mark the goal complete by user command" },
  { value: "budget ", label: "budget <tokens>", description: "Set a positive token budget" },
];

export function getGoalArgumentCompletions(prefix: string): AutocompleteItem[] | null {
  const trimmedStart = prefix.trimStart();
  if (trimmedStart.includes(" ")) return null;

  const matches = GOAL_SUBCOMMAND_COMPLETIONS.filter((item) => item.value.startsWith(trimmedStart));
  return matches.length > 0 ? matches : null;
}

export default function goalModeExtension(pi: ExtensionAPI): void {
  let goal: GoalState | null = null;
  let activeTurnStartedAt: number | undefined;
  let goalTurnCounter = 0;
  let blockedReportedThisGoalTurn = false;

  function persist(next: GoalStateEntry): void {
    pi.appendEntry(GOAL_STATE_ENTRY, next);
  }

  function updateStatus(ctx: ExtensionContext): void {
    if (!goal) {
      ctx.ui.setStatus("goal-mode", undefined);
      ctx.ui.setWidget("goal-mode", undefined);
      return;
    }

    const icon = goal.status === "complete" ? "✅" : goal.status === "blocked" ? "⛔" : "🎯";
    const budget =
      goal.tokenBudget === undefined ? "" : ` · ${goal.tokensUsed}/${goal.tokenBudget}`;
    ctx.ui.setStatus("goal-mode", ctx.ui.theme.fg("accent", `${icon} ${goal.status}${budget}`));

    if (shouldInjectGoal(goal)) {
      const used =
        goal.tokenBudget === undefined ? goal.tokensUsed : `${goal.tokensUsed}/${goal.tokenBudget}`;
      ctx.ui.setWidget("goal-mode", [
        `${ctx.ui.theme.fg("accent", "🎯 Goal:")} ${shortObjective(goal.objective)}`,
        `Status: ${goal.status}`,
        `Usage: ${used} tokens · ${goal.timeUsedSeconds}s`,
      ]);
    } else {
      ctx.ui.setWidget("goal-mode", undefined);
    }
  }

  function setGoal(next: GoalState | null, ctx: ExtensionContext): void {
    goal = next;
    persist(next ?? { cleared: true, updatedAt: nowMs() });
    updateStatus(ctx);
  }

  function triggerGoalWork(
    ctx: ExtensionContext,
    currentGoal: GoalState,
    reason: "set" | "edit" | "resume",
  ): void {
    const prompt = goalWorkPrompt(currentGoal, reason);
    if (ctx.isIdle()) {
      pi.sendUserMessage(prompt);
    } else {
      pi.sendUserMessage(prompt, { deliverAs: "followUp" });
    }
  }

  function requireGoal(ctx: ExtensionContext): GoalState | null {
    if (goal) return goal;
    ctx.ui.notify("No Pi session goal is set. Use /goal set <objective> first.", "warning");
    return null;
  }

  function createAndStartGoal(ctx: ExtensionContext, objective: string): void {
    const next = createGoalState(objective);
    setGoal(next, ctx);
    ctx.ui.notify(`Goal set: ${next.objective}`, "info");
    triggerGoalWork(ctx, next, "set");
  }

  pi.registerCommand("goal", {
    description: "Create, edit, inspect, and manage a Codex-like Pi session goal",
    getArgumentCompletions: getGoalArgumentCompletions,
    handler: async (args, ctx) => {
      const trimmed = args.trim();

      try {
        if (!trimmed) {
          if (!ctx.hasUI) {
            ctx.ui.notify(
              "Use /goal set <objective> to set a goal in non-interactive mode.",
              "warning",
            );
            return;
          }
          const edited = await ctx.ui.editor("Pi session goal:", goal?.objective ?? "");
          if (edited?.trim()) {
            const currentGoal = goal;
            const next = currentGoal
              ? editGoalObjective(currentGoal, edited)
              : createGoalState(edited);
            setGoal(next, ctx);
            triggerGoalWork(ctx, next, currentGoal ? "edit" : "set");
          }
          return;
        }

        const command = trimmed.split(/\s+/, 1)[0]!;
        const remainder = trimmed.slice(command.length).trim();

        switch (command) {
          case "set": {
            if (!remainder) throw new Error("Usage: /goal set <objective>");
            createAndStartGoal(ctx, remainder);
            return;
          }
          case "edit": {
            const current = requireGoal(ctx);
            if (!current) return;
            if (!ctx.hasUI) throw new Error("/goal edit requires interactive UI.");
            const edited = await ctx.ui.editor("Edit Pi session goal:", current.objective);
            if (!edited?.trim()) return;
            const next = editGoalObjective(current, edited);
            setGoal(next, ctx);
            triggerGoalWork(ctx, next, "edit");
            return;
          }
          case "status": {
            ctx.ui.notify(formatGoalStatus(goal), "info");
            return;
          }
          case "pause": {
            const current = requireGoal(ctx);
            if (!current) return;
            setGoal(setGoalStatus(current, "paused"), ctx);
            ctx.ui.notify("Goal paused.", "info");
            return;
          }
          case "resume": {
            const current = requireGoal(ctx);
            if (!current) return;
            const next = setGoalStatus(current, "active");
            setGoal(next, ctx);
            ctx.ui.notify("Goal resumed.", "info");
            triggerGoalWork(ctx, next, "resume");
            return;
          }
          case "clear": {
            if (!goal) {
              ctx.ui.notify("No Pi session goal is set.", "info");
              return;
            }
            if (ctx.hasUI) {
              const confirmed = await ctx.ui.confirm("Clear Pi session goal?", goal.objective);
              if (!confirmed) return;
            }
            setGoal(null, ctx);
            ctx.ui.notify("Goal cleared.", "info");
            return;
          }
          case "done": {
            const current = requireGoal(ctx);
            if (!current) return;
            setGoal(setGoalStatus(current, "complete"), ctx);
            ctx.ui.notify("Goal marked complete by user.", "info");
            return;
          }
          case "budget": {
            const current = requireGoal(ctx);
            if (!current) return;
            const tokenBudget = parseTokenBudget(remainder);
            setGoal(setTokenBudget(current, tokenBudget), ctx);
            ctx.ui.notify(`Goal token budget set to ${tokenBudget}.`, "info");
            return;
          }
          default:
            throw new Error(
              "Usage: /goal [set|edit|status|pause|resume|clear|done|budget] [...args]",
            );
        }
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    },
  });

  pi.registerTool({
    name: "goal_update",
    label: "Goal Update",
    description:
      "Update the active Pi session goal. Use only to mark the goal complete or genuinely blocked under the goal rules.",
    promptSnippet:
      "Mark the active Pi session goal complete or blocked when strict goal criteria are met.",
    promptGuidelines: [
      "Use goal_update with status complete only when current evidence proves the full active Pi session goal is achieved and no required work remains.",
      "Use goal_update with status blocked only after the same blocker has repeated for at least three consecutive goal turns and no meaningful progress is possible.",
      "Do not use goal_update to pause, resume, clear, or redefine a goal; those actions are user-controlled.",
    ],
    parameters: GoalUpdateParamsSchema as never,
    async execute(_toolCallId, params: GoalUpdateParams, _signal, _onUpdate, ctx) {
      if (!goal) {
        return {
          content: [{ type: "text", text: "No active Pi session goal is set." }],
          details: { updated: false, reason: "no_goal" },
        };
      }

      const evidence = params.evidence.trim();
      if (!evidence) throw new Error("goal_update requires non-empty evidence.");

      if (params.status === "complete") {
        const completed = setGoalStatus({ ...goal, blockerStreak: undefined }, "complete");
        setGoal(completed, ctx);
        return {
          content: [
            {
              type: "text",
              text: `Goal marked complete. Evidence: ${evidence}\nUsage: ${completed.tokensUsed}${completed.tokenBudget === undefined ? "" : `/${completed.tokenBudget}`} tokens, ${completed.timeUsedSeconds}s.`,
            },
          ],
          details: { updated: true, goal: completed, evidence },
        };
      }

      const blockerSummary =
        params.blockerSummary?.trim() || params.remainingWork?.trim() || evidence;
      blockedReportedThisGoalTurn = true;
      const blocked = handleBlockedUpdate(goal, blockerSummary, nowMs(), `turn-${goalTurnCounter}`);
      setGoal(blocked.goal, ctx);

      if (!blocked.thresholdReached) {
        return {
          content: [
            {
              type: "text",
              text: `Blocked audit recorded (${blocked.goal.blockerStreak!.count}/${BLOCKED_THRESHOLD}) for: ${blockerSummary}\nDo not mark the goal blocked yet. Keep making meaningful progress if possible, or ask the user for the specific missing input.`,
            },
          ],
          details: { updated: true, thresholdReached: false, goal: blocked.goal, evidence },
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Goal marked blocked after ${BLOCKED_THRESHOLD} consecutive reports of the same blocker: ${blockerSummary}\nEvidence: ${evidence}`,
          },
        ],
        details: { updated: true, thresholdReached: true, goal: blocked.goal, evidence },
      };
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    goal = restoreLatestGoalState(ctx.sessionManager.getEntries() as SessionEntryLike[]);
    updateStatus(ctx);
  });

  pi.on("context", async (event) => {
    return {
      messages: event.messages.filter((message) => {
        const candidate = message as { customType?: string };
        return candidate.customType !== GOAL_CONTEXT_MESSAGE;
      }),
    };
  });

  pi.on("before_agent_start", async (event) => {
    if (!shouldInjectGoal(goal)) return;

    return {
      systemPrompt: `${event.systemPrompt}\n\n${buildGoalContext(goal)}`,
    };
  });

  pi.on("agent_start", async () => {
    if (shouldInjectGoal(goal)) {
      goalTurnCounter += 1;
      blockedReportedThisGoalTurn = false;
      activeTurnStartedAt = nowMs();
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (!shouldInjectGoal(goal)) return;

    const elapsedSeconds = activeTurnStartedAt
      ? Math.max(0, Math.floor((nowMs() - activeTurnStartedAt) / 1000))
      : 0;
    activeTurnStartedAt = undefined;

    const tokenDelta = extractUsageTokens(event.message);
    const usageUpdated = updateTokenUsage(goal, tokenDelta, elapsedSeconds);
    const blockerUpdated = blockedReportedThisGoalTurn
      ? usageUpdated
      : clearBlockerStreak(usageUpdated);
    const next = applyGoalBudget(blockerUpdated);
    blockedReportedThisGoalTurn = false;
    setGoal(next, ctx);
  });
}
