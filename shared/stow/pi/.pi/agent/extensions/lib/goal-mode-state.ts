import { randomUUID } from "node:crypto";

export type GoalStatus = "active" | "paused" | "blocked" | "budget_limited" | "complete";

export type GoalState = {
  id: string;
  objective: string;
  status: GoalStatus;
  tokenBudget?: number;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
  blockerStreak?: {
    summary: string;
    count: number;
    lastTurnKey?: string;
  };
};

export type GoalStateEntry = GoalState | { cleared: true; updatedAt: number };

export type SessionEntryLike = {
  type?: string;
  customType?: string;
  data?: unknown;
};

export type GoalUpdateStatus = "complete" | "blocked";

export const GOAL_STATE_ENTRY = "goal-state";
export const GOAL_CONTEXT_MESSAGE = "goal-mode-context";
export const BLOCKED_THRESHOLD = 3;

export function nowMs(): number {
  return Date.now();
}

export function createGoalState(
  objective: string,
  createdAt: number = nowMs(),
  tokenBudget?: number,
): GoalState {
  const trimmed = objective.trim();
  if (!trimmed) throw new Error("Goal objective cannot be empty.");

  return {
    id: `goal-${randomUUID()}`,
    objective: trimmed,
    status: "active",
    tokenBudget,
    tokensUsed: 0,
    timeUsedSeconds: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

export function isGoalState(value: unknown): value is GoalState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GoalState>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.objective === "string" &&
    ["active", "paused", "blocked", "budget_limited", "complete"].includes(
      candidate.status ?? "",
    ) &&
    typeof candidate.tokensUsed === "number" &&
    typeof candidate.timeUsedSeconds === "number" &&
    typeof candidate.createdAt === "number" &&
    typeof candidate.updatedAt === "number"
  );
}

function isClearRecord(value: unknown): value is { cleared: true; updatedAt: number } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { cleared?: unknown; updatedAt?: unknown };
  return candidate.cleared === true && typeof candidate.updatedAt === "number";
}

export function restoreLatestGoalState(entries: readonly SessionEntryLike[]): GoalState | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== "custom" || entry.customType !== GOAL_STATE_ENTRY) continue;
    if (isClearRecord(entry.data)) return null;
    if (isGoalState(entry.data)) return entry.data;
  }
  return null;
}

export function editGoalObjective(
  goal: GoalState,
  objective: string,
  updatedAt: number = nowMs(),
): GoalState {
  const trimmed = objective.trim();
  if (!trimmed) throw new Error("Goal objective cannot be empty.");

  return applyGoalBudget(
    {
      ...goal,
      objective: trimmed,
      status: "active",
      blockerStreak: undefined,
      updatedAt,
    },
    updatedAt,
  );
}

export function setGoalStatus(
  goal: GoalState,
  status: GoalStatus,
  updatedAt: number = nowMs(),
): GoalState {
  const next = {
    ...goal,
    status,
    blockerStreak: status === "active" ? undefined : goal.blockerStreak,
    updatedAt,
  };

  return status === "active" ? applyGoalBudget(next, updatedAt) : next;
}

export function setTokenBudget(
  goal: GoalState,
  tokenBudget: number,
  updatedAt: number = nowMs(),
): GoalState {
  if (!Number.isInteger(tokenBudget) || tokenBudget <= 0) {
    throw new Error("Goal token budget must be a positive integer.");
  }

  const status =
    goal.status === "budget_limited" && goal.tokensUsed < tokenBudget ? "active" : goal.status;

  return applyGoalBudget(
    {
      ...goal,
      status,
      tokenBudget,
      updatedAt,
    },
    updatedAt,
  );
}

export function updateTokenUsage(
  goal: GoalState,
  tokenDelta: number,
  elapsedSeconds: number,
  updatedAt: number = nowMs(),
): GoalState {
  const safeTokenDelta = Number.isFinite(tokenDelta) && tokenDelta > 0 ? Math.floor(tokenDelta) : 0;
  const safeElapsedSeconds =
    Number.isFinite(elapsedSeconds) && elapsedSeconds > 0 ? Math.floor(elapsedSeconds) : 0;

  return {
    ...goal,
    tokensUsed: goal.tokensUsed + safeTokenDelta,
    timeUsedSeconds: goal.timeUsedSeconds + safeElapsedSeconds,
    updatedAt,
  };
}

export function applyGoalBudget(goal: GoalState, updatedAt: number = nowMs()): GoalState {
  if (
    goal.status === "active" &&
    goal.tokenBudget !== undefined &&
    goal.tokensUsed >= goal.tokenBudget
  ) {
    return {
      ...goal,
      status: "budget_limited",
      updatedAt,
    };
  }
  return goal;
}

function normalizeBlocker(summary: string): string {
  return summary.trim().replace(/\s+/g, " ");
}

export function clearBlockerStreak(goal: GoalState, updatedAt: number = nowMs()): GoalState {
  if (!goal.blockerStreak) return goal;
  return {
    ...goal,
    blockerStreak: undefined,
    updatedAt,
  };
}

export function parseTokenBudget(input: string): number {
  const trimmed = input.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) throw new Error("Goal token budget must be a positive integer.");
  const tokenBudget = Number(trimmed);
  if (!Number.isSafeInteger(tokenBudget)) throw new Error("Goal token budget is too large.");
  return tokenBudget;
}

export function handleBlockedUpdate(
  goal: GoalState,
  blockerSummary: string,
  updatedAt: number = nowMs(),
  turnKey?: string,
): { goal: GoalState; thresholdReached: boolean } {
  const summary = normalizeBlocker(blockerSummary);
  if (!summary) throw new Error("Blocked goal updates require blockerSummary.");

  const previous = goal.blockerStreak;
  const sameBlocker = previous?.summary === summary;
  const sameTurn = turnKey !== undefined && previous?.lastTurnKey === turnKey;
  const count = sameBlocker && previous ? previous.count + (sameTurn ? 0 : 1) : 1;
  const thresholdReached = count >= BLOCKED_THRESHOLD;

  return {
    thresholdReached,
    goal: {
      ...goal,
      status: thresholdReached ? "blocked" : goal.status,
      blockerStreak: { summary, count, lastTurnKey: turnKey },
      updatedAt,
    },
  };
}

export function buildGoalContext(goal: GoalState): string {
  const budgetLine =
    goal.tokenBudget === undefined
      ? "Token budget: none"
      : `Token budget: ${goal.tokensUsed}/${goal.tokenBudget} tokens`;
  const blockerLine = goal.blockerStreak
    ? `Current blocker audit: ${goal.blockerStreak.summary} (${goal.blockerStreak.count}/${BLOCKED_THRESHOLD})`
    : "Current blocker audit: none";
  const budgetLimitedInstructions =
    goal.status === "budget_limited"
      ? `\nThe active goal has reached its token budget. Wrap up this turn soon: summarize useful progress, identify remaining work or blockers, and leave the user with a clear next step. Do not call goal_update unless the goal is actually complete.`
      : "";

  return `[ACTIVE PI SESSION GOAL]
Objective: ${goal.objective}
Status: ${goal.status}
${budgetLine}
Elapsed active time: ${goal.timeUsedSeconds}s
${blockerLine}

Continue working toward the active Pi session goal.
- This goal persists across turns. Ending this turn does not require shrinking the objective to what fits now.
- Keep the full objective intact; do not shrink, narrow, or redefine success around a smaller or easier task.
- Make concrete progress toward the real requested end state. If it cannot be finished now, leave the goal active.
- Treat completion as unproven until current evidence verifies every requirement against the actual current state.
- Only call goal_update with status "complete" when current evidence proves every requirement is satisfied and no required work remains.
- Only call goal_update with status "blocked" when the same blocker has repeated for at least three consecutive goal turns and no meaningful progress is possible without user input or an external-state change.
- Do not mark a goal complete merely because the token budget is nearly exhausted or because this turn is ending.${budgetLimitedInstructions}`;
}

export function formatGoalStatus(goal: GoalState | null): string {
  if (!goal) return "No Pi session goal is set.";

  const budget =
    goal.tokenBudget === undefined
      ? `${goal.tokensUsed} tokens`
      : `${goal.tokensUsed}/${goal.tokenBudget} tokens`;
  const blocker = goal.blockerStreak
    ? `\nBlocker audit: ${goal.blockerStreak.summary} (${goal.blockerStreak.count}/${BLOCKED_THRESHOLD})`
    : "";

  return `Goal: ${goal.objective}
Status: ${goal.status}
Usage: ${budget}, ${goal.timeUsedSeconds}s elapsed${blocker}`;
}

export function extractUsageTokens(message: unknown): number {
  if (!message || typeof message !== "object") return 0;
  const usage = (message as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return 0;
  const candidate = usage as Record<string, unknown>;

  const tokenFields = ["input", "output", "cacheRead", "cacheWrite", "reasoningOutput"];
  const total = tokenFields.reduce((sum, key) => {
    const value = candidate[key];
    return sum + (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);

  return Math.floor(total);
}

export function shouldInjectGoal(goal: GoalState | null): goal is GoalState {
  return goal?.status === "active" || goal?.status === "budget_limited";
}
