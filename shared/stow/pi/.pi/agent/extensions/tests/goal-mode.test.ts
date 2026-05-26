import goalModeExtension, { getGoalArgumentCompletions } from "../goal-mode.js";
import {
  applyGoalBudget,
  buildGoalContext,
  clearBlockerStreak,
  createGoalState,
  editGoalObjective,
  extractUsageTokens,
  formatGoalStatus,
  handleBlockedUpdate,
  isGoalState,
  parseTokenBudget,
  restoreLatestGoalState,
  setGoalStatus,
  setTokenBudget,
  updateTokenUsage,
  type GoalState,
} from "../lib/goal-mode-state.js";

type TestContext = {
  hasUI: boolean;
  isIdle: () => boolean;
  ui: {
    notify: jest.Mock;
    setStatus: jest.Mock;
    setWidget: jest.Mock;
    editor: jest.Mock;
    confirm: jest.Mock;
    theme: { fg: (_color: string, text: string) => string };
  };
  sessionManager: { getEntries: jest.Mock };
};

type RegisteredCommand = {
  handler: (args: string, ctx: TestContext) => Promise<void>;
  getArgumentCompletions?: (prefix: string) => unknown;
};

type RegisteredTool = {
  execute: (
    toolCallId: string,
    params: {
      status: "complete" | "blocked";
      evidence: string;
      remainingWork?: string;
      blockerSummary?: string;
    },
    signal: unknown,
    onUpdate: unknown,
    ctx: TestContext,
  ) => Promise<unknown>;
};

type EventHandler = (event: unknown, ctx: TestContext) => Promise<unknown>;

function createHarness(options?: {
  hasUI?: boolean;
  isIdle?: boolean;
  editorValues?: Array<string | undefined>;
  confirmValues?: boolean[];
  entries?: unknown[];
}) {
  const commands = new Map<string, RegisteredCommand>();
  const events = new Map<string, EventHandler>();
  let tool: RegisteredTool | undefined;
  const editorValues = [...(options?.editorValues ?? [])];
  const confirmValues = [...(options?.confirmValues ?? [])];
  const appendEntry = jest.fn();
  const sendUserMessage = jest.fn();
  const ctx: TestContext = {
    hasUI: options?.hasUI ?? true,
    isIdle: () => options?.isIdle ?? true,
    ui: {
      notify: jest.fn(),
      setStatus: jest.fn(),
      setWidget: jest.fn(),
      editor: jest.fn(async () => editorValues.shift()),
      confirm: jest.fn(async () => confirmValues.shift() ?? false),
      theme: { fg: (_color: string, text: string) => text },
    },
    sessionManager: { getEntries: jest.fn(() => options?.entries ?? []) },
  };

  goalModeExtension({
    appendEntry,
    sendUserMessage,
    registerCommand: (name: string, command: RegisteredCommand) => commands.set(name, command),
    registerTool: (registeredTool: RegisteredTool) => {
      tool = registeredTool;
    },
    on: (event: string, handler: EventHandler) => events.set(event, handler),
  } as never);

  const command = commands.get("goal");
  if (!command) throw new Error("goal command was not registered");
  if (!tool) throw new Error("goal_update tool was not registered");

  return { appendEntry, command, ctx, events, sendUserMessage, tool };
}

describe("goal-mode state", () => {
  it("creates an active goal from a user objective", () => {
    expect(() => createGoalState("   ")).toThrow("empty");
    const goal = createGoalState("  Refactor auth and land tests  ", 1000, 1000);

    expect(goal).toMatchObject({
      objective: "Refactor auth and land tests",
      status: "active",
      tokenBudget: 1000,
      tokensUsed: 0,
      timeUsedSeconds: 0,
    });
    expect(goal.id).toMatch(/^goal-/);
    expect(goal.createdAt).toBe(1000);
    expect(goal.updatedAt).toBe(1000);
  });

  it("restores the latest persisted goal-state entry and honors clear records", () => {
    const older = createGoalState("older", 1);
    const newer = createGoalState("newer", 2);

    expect(
      restoreLatestGoalState([
        { type: "custom", customType: "goal-state", data: older },
        { type: "custom", customType: "other", data: { ignored: true } },
        { type: "custom", customType: "goal-state", data: newer },
      ]),
    ).toEqual(newer);

    expect(
      restoreLatestGoalState([
        { type: "custom", customType: "goal-state", data: newer },
        { type: "custom", customType: "goal-state", data: { cleared: true, updatedAt: 3 } },
      ]),
    ).toBeNull();

    expect(
      restoreLatestGoalState([
        { type: "custom", customType: "goal-state", data: null },
        { type: "custom", customType: "goal-state", data: { id: "bad" } },
      ]),
    ).toBeNull();
  });

  it("builds Codex-like active-goal context without shrinking the objective", () => {
    const goal = createGoalState("Build the complete feature, including tests", 1000);

    const context = buildGoalContext(goal);

    expect(context).toContain("Continue working toward the active Pi session goal");
    expect(context).toContain("Build the complete feature, including tests");
    expect(context).toContain("do not shrink, narrow, or redefine success");
    expect(context).toContain('goal_update with status "complete"');
    expect(context).toContain(
      "same blocker has repeated for at least three consecutive goal turns",
    );
  });

  it("only transitions to blocked after the same blocker is reported three times", () => {
    let goal: GoalState = createGoalState("Ship the goal", 1000);

    let result = handleBlockedUpdate(goal, "CI is down", 1100);
    expect(result.thresholdReached).toBe(false);
    expect(result.goal.status).toBe("active");
    expect(result.goal.blockerStreak).toEqual({
      summary: "CI is down",
      count: 1,
      lastTurnKey: undefined,
    });

    result = handleBlockedUpdate(result.goal, "CI is down", 1200, "turn-1");
    expect(result.thresholdReached).toBe(false);
    expect(result.goal.status).toBe("active");
    expect(result.goal.blockerStreak?.count).toBe(2);

    result = handleBlockedUpdate(result.goal, "CI is down", 1250, "turn-1");
    expect(result.thresholdReached).toBe(false);
    expect(result.goal.blockerStreak?.count).toBe(2);

    result = handleBlockedUpdate(result.goal, "Different blocker", 1300, "turn-2");
    expect(result.thresholdReached).toBe(false);
    expect(result.goal.status).toBe("active");
    expect(result.goal.blockerStreak).toEqual({
      summary: "Different blocker",
      count: 1,
      lastTurnKey: "turn-2",
    });

    result = handleBlockedUpdate(result.goal, "Different blocker", 1400, "turn-3");
    result = handleBlockedUpdate(result.goal, "Different blocker", 1500, "turn-4");
    expect(result.thresholdReached).toBe(true);
    expect(result.goal.status).toBe("blocked");
    expect(result.goal.blockerStreak?.count).toBe(3);
  });

  it("parses only complete positive integer token budgets", () => {
    expect(parseTokenBudget("50")).toBe(50);
    expect(() => parseTokenBudget("10abc")).toThrow("positive integer");
    expect(() => parseTokenBudget("1.5")).toThrow("positive integer");
    expect(() => parseTokenBudget("10 extra")).toThrow("positive integer");
    expect(() => parseTokenBudget("0")).toThrow("positive integer");
    expect(() => setTokenBudget(createGoalState("Budget", 1000), 0)).toThrow("positive integer");
  });

  it("recognizes valid restored goal state and rejects invalid values", () => {
    const goal = createGoalState("Valid", 1000);

    expect(isGoalState(goal)).toBe(true);
    expect(isGoalState(null)).toBe(false);
    expect(isGoalState({ ...goal, status: "not-real" })).toBe(false);
    expect(isGoalState({ id: "goal-1", objective: "Missing status" })).toBe(false);
  });

  it("extracts per-turn usage tokens without counting cumulative context totals", () => {
    expect(
      extractUsageTokens({
        usage: {
          input: 10,
          output: 5,
          cacheRead: 3,
          cacheWrite: 2,
          reasoningOutput: 1,
          totalTokens: 999_999,
        },
      }),
    ).toBe(21);
    expect(extractUsageTokens({ usage: { totalTokens: 999_999 } })).toBe(0);
    expect(extractUsageTokens({ usage: { outputTokens: 7 } })).toBe(0);
    expect(extractUsageTokens({ usage: { output: 0 } })).toBe(0);
    expect(extractUsageTokens({})).toBe(0);
    expect(extractUsageTokens(null)).toBe(0);

    const updated = updateTokenUsage(createGoalState("Usage", 1000), -1, 2, 1100);
    expect(updated.tokensUsed).toBe(0);
    expect(updated.timeUsedSeconds).toBe(2);
  });

  it("transitions active goals to budget_limited when usage reaches the budget", () => {
    const goal = createGoalState("Stay within budget", 1000, 50);
    const withUsage = updateTokenUsage(goal, 50, 0, 1100);

    const budgeted = applyGoalBudget(withUsage, 1200);

    expect(budgeted.status).toBe("budget_limited");
    expect(buildGoalContext(budgeted)).toContain("token budget");
    expect(buildGoalContext(budgeted)).toContain("Wrap up this turn soon");
    expect(setGoalStatus(budgeted, "active", 1300).status).toBe("budget_limited");
    expect(editGoalObjective(budgeted, "New objective", 1400).status).toBe("budget_limited");
    expect(setTokenBudget(budgeted, 51, 1500).status).toBe("active");
    expect(() => editGoalObjective(goal, "   ")).toThrow("empty");
    expect(() => parseTokenBudget("999999999999999999999999999999")).toThrow("too large");
  });

  it("resets blocker streaks when a goal turn passes without the same blocker", () => {
    const first = handleBlockedUpdate(
      createGoalState("Ship it", 1000),
      "CI is down",
      1100,
      "turn-1",
    );
    const afterSkippedTurn = clearBlockerStreak(first.goal, 1200);
    const second = handleBlockedUpdate(afterSkippedTurn, "CI is down", 1300, "turn-3");
    const noTimestamp = handleBlockedUpdate(second.goal, "CI is down");

    expect(second.thresholdReached).toBe(false);
    expect(second.goal.blockerStreak?.count).toBe(1);
    expect(noTimestamp.goal.blockerStreak?.count).toBe(2);
    expect(() => handleBlockedUpdate(second.goal, "   ")).toThrow("blockerSummary");
  });

  it("formats status with objective, status, usage, budget, and blocker streak", () => {
    const goal = {
      ...createGoalState("Finish everything", 1000, 10),
      tokensUsed: 3,
      timeUsedSeconds: 12,
      blockerStreak: { summary: "Waiting on API key", count: 2, lastTurnKey: "turn-2" },
    } satisfies GoalState;

    const status = formatGoalStatus(goal);

    expect(status).toContain("Finish everything");
    expect(status).toContain("active");
    expect(status).toContain("3/10 tokens");
    expect(status).toContain("12s");
    expect(status).toContain("Waiting on API key (2/3)");
    expect(formatGoalStatus(null)).toBe("No Pi session goal is set.");
    expect(buildGoalContext(goal)).toContain("Current blocker audit: Waiting on API key (2/3)");
  });

  it("autocompletes /goal subcommands", () => {
    expect(getGoalArgumentCompletions("")?.map((item) => item.label)).toEqual([
      "set <objective>",
      "edit",
      "status",
      "pause",
      "resume",
      "clear",
      "done",
      "budget <tokens>",
    ]);
    expect(getGoalArgumentCompletions("st")?.map((item) => item.value)).toEqual(["status"]);
    expect(getGoalArgumentCompletions("s")?.map((item) => item.value)).toEqual(["set ", "status"]);
    expect(getGoalArgumentCompletions("set already writing objective")).toBeNull();
    expect(getGoalArgumentCompletions("unknown")).toBeNull();
  });

  it("/goal set persists state, updates UI, and immediately starts work", async () => {
    const { appendEntry, command, ctx, sendUserMessage } = createHarness();

    await command.handler(`set ${"x".repeat(80)}`, ctx);
    expect(ctx.ui.setWidget).toHaveBeenCalledWith(
      "goal-mode",
      expect.arrayContaining([expect.stringContaining("...")]),
    );

    await command.handler("set Refactor auth and land tests", ctx);

    expect(appendEntry).toHaveBeenCalledWith(
      "goal-state",
      expect.objectContaining({
        objective: "Refactor auth and land tests",
        status: "active",
      }),
    );
    expect(ctx.ui.setStatus).toHaveBeenCalledWith("goal-mode", expect.stringContaining("active"));
    expect(ctx.ui.setWidget).toHaveBeenCalledWith("goal-mode", expect.any(Array));
    expect(sendUserMessage).toHaveBeenCalledWith(
      expect.stringContaining("Start working toward the active Pi session goal"),
    );
  });

  it("handles editor-driven goal creation, editing, cancellation, and non-interactive usage", async () => {
    const interactive = createHarness({ editorValues: ["Editor goal", "Edited goal", undefined] });
    await interactive.command.handler("", interactive.ctx);
    await interactive.command.handler("", interactive.ctx);
    await interactive.command.handler("", interactive.ctx);

    expect(interactive.ctx.ui.editor).toHaveBeenNthCalledWith(1, "Pi session goal:", "");
    expect(interactive.ctx.ui.editor).toHaveBeenNthCalledWith(2, "Pi session goal:", "Editor goal");
    expect(interactive.sendUserMessage).toHaveBeenCalledTimes(2);
    expect(interactive.appendEntry).toHaveBeenLastCalledWith(
      "goal-state",
      expect.objectContaining({ objective: "Edited goal" }),
    );

    const nonInteractive = createHarness({ hasUI: false });
    await nonInteractive.command.handler("", nonInteractive.ctx);
    expect(nonInteractive.ctx.ui.notify).toHaveBeenCalledWith(
      "Use /goal set <objective> to set a goal in non-interactive mode.",
      "warning",
    );

    const throwing = createHarness();
    throwing.ctx.ui.editor.mockRejectedValueOnce("string failure");
    await throwing.command.handler("", throwing.ctx);
    expect(throwing.ctx.ui.notify).toHaveBeenCalledWith("string failure", "error");
  });

  it("reports goal command errors and missing-goal cases", async () => {
    const { command, ctx } = createHarness();

    await command.handler("set", ctx);
    await command.handler("edit", ctx);
    await command.handler("pause", ctx);
    await command.handler("resume", ctx);
    await command.handler("done", ctx);
    await command.handler("budget 10abc", ctx);
    await command.handler("nonsense", ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith("Usage: /goal set <objective>", "error");
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "No Pi session goal is set. Use /goal set <objective> first.",
      "warning",
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Usage: /goal [set|edit|status|pause|resume|clear|done|budget] [...args]",
      "error",
    );
  });

  it("supports status, pause, resume, done, budget, and follow-up triggering", async () => {
    const { appendEntry, command, ctx, sendUserMessage } = createHarness({ isIdle: false });

    await command.handler("set Follow up goal", ctx);
    await command.handler("status", ctx);
    await command.handler("pause", ctx);
    await command.handler("resume", ctx);
    await command.handler("budget 100", ctx);
    await command.handler("done", ctx);

    expect(sendUserMessage).toHaveBeenCalledWith(expect.any(String), { deliverAs: "followUp" });
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Goal: Follow up goal"),
      "info",
    );
    expect(ctx.ui.notify).toHaveBeenCalledWith("Goal paused.", "info");
    expect(ctx.ui.notify).toHaveBeenCalledWith("Goal resumed.", "info");
    expect(ctx.ui.notify).toHaveBeenCalledWith("Goal token budget set to 100.", "info");
    expect(ctx.ui.notify).toHaveBeenCalledWith("Goal marked complete by user.", "info");
    expect(appendEntry).toHaveBeenLastCalledWith(
      "goal-state",
      expect.objectContaining({ status: "complete" }),
    );
  });

  it("clears goals with confirmation, cancellation, and non-UI fallback", async () => {
    const cancelled = createHarness({ confirmValues: [false] });
    await cancelled.command.handler("set Keep me", cancelled.ctx);
    await cancelled.command.handler("clear", cancelled.ctx);
    expect(cancelled.appendEntry).toHaveBeenCalledTimes(1);

    const confirmed = createHarness({ confirmValues: [true] });
    await confirmed.command.handler("set Clear me", confirmed.ctx);
    await confirmed.command.handler("clear", confirmed.ctx);
    expect(confirmed.appendEntry).toHaveBeenLastCalledWith(
      "goal-state",
      expect.objectContaining({ cleared: true }),
    );
    expect(confirmed.ctx.ui.notify).toHaveBeenCalledWith("Goal cleared.", "info");

    const noUi = createHarness({ hasUI: false });
    await noUi.command.handler("set Clear without UI", noUi.ctx);
    await noUi.command.handler("clear", noUi.ctx);
    expect(noUi.appendEntry).toHaveBeenLastCalledWith(
      "goal-state",
      expect.objectContaining({ cleared: true }),
    );

    const empty = createHarness();
    await empty.command.handler("clear", empty.ctx);
    expect(empty.ctx.ui.notify).toHaveBeenCalledWith("No Pi session goal is set.", "info");
  });

  it("edits existing goals and handles non-UI edit errors", async () => {
    const interactive = createHarness({ editorValues: [undefined, "Edited from command"] });
    await interactive.command.handler("set Original", interactive.ctx);
    await interactive.command.handler("edit", interactive.ctx);
    await interactive.command.handler("edit", interactive.ctx);
    expect(interactive.appendEntry).toHaveBeenLastCalledWith(
      "goal-state",
      expect.objectContaining({ objective: "Edited from command" }),
    );

    const nonUi = createHarness({ hasUI: false });
    await nonUi.command.handler("set Original", nonUi.ctx);
    await nonUi.command.handler("edit", nonUi.ctx);
    expect(nonUi.ctx.ui.notify).toHaveBeenCalledWith(
      "/goal edit requires interactive UI.",
      "error",
    );
  });

  it("handles goal_update tool complete, blocked, missing goal, and invalid evidence", async () => {
    const empty = createHarness();
    await expect(
      empty.tool.execute(
        "tool",
        { status: "complete", evidence: "done" },
        undefined,
        undefined,
        empty.ctx,
      ),
    ).resolves.toMatchObject({ details: { updated: false, reason: "no_goal" } });

    const complete = createHarness();
    await complete.command.handler("set Finish", complete.ctx);
    await complete.command.handler("budget 100", complete.ctx);
    await expect(
      complete.tool.execute(
        "tool",
        { status: "complete", evidence: " verified " },
        undefined,
        undefined,
        complete.ctx,
      ),
    ).resolves.toMatchObject({
      content: [{ text: expect.stringContaining("/100"), type: "text" }],
      details: { updated: true, evidence: "verified" },
    });
    expect(complete.appendEntry).toHaveBeenLastCalledWith(
      "goal-state",
      expect.objectContaining({ status: "complete" }),
    );

    const completeWithoutBudget = createHarness();
    await completeWithoutBudget.command.handler("set Finish", completeWithoutBudget.ctx);
    await expect(
      completeWithoutBudget.tool.execute(
        "tool",
        { status: "complete", evidence: "verified" },
        undefined,
        undefined,
        completeWithoutBudget.ctx,
      ),
    ).resolves.toMatchObject({
      content: [{ text: expect.not.stringContaining("/100"), type: "text" }],
    });

    const invalid = createHarness();
    await invalid.command.handler("set Finish", invalid.ctx);
    await expect(
      invalid.tool.execute(
        "tool",
        { status: "complete", evidence: "   " },
        undefined,
        undefined,
        invalid.ctx,
      ),
    ).rejects.toThrow("non-empty evidence");

    const blocked = createHarness();
    await blocked.command.handler("set Block me", blocked.ctx);
    await blocked.events.get("agent_start")?.({}, blocked.ctx);
    await expect(
      blocked.tool.execute(
        "tool",
        { status: "blocked", evidence: "CI down" },
        undefined,
        undefined,
        blocked.ctx,
      ),
    ).resolves.toMatchObject({ details: { thresholdReached: false } });
    await blocked.events.get("turn_end")?.({ message: {} }, blocked.ctx);
    await blocked.events.get("agent_start")?.({}, blocked.ctx);
    await expect(
      blocked.tool.execute(
        "tool",
        { status: "blocked", evidence: "cannot proceed", blockerSummary: "CI down" },
        undefined,
        undefined,
        blocked.ctx,
      ),
    ).resolves.toMatchObject({ details: { thresholdReached: false } });
    await blocked.events.get("agent_start")?.({}, blocked.ctx);
    await blocked.tool.execute(
      "tool",
      { status: "blocked", evidence: "cannot proceed", remainingWork: "CI down" },
      undefined,
      undefined,
      blocked.ctx,
    );
    await blocked.events.get("agent_start")?.({}, blocked.ctx);
    await expect(
      blocked.tool.execute(
        "tool",
        { status: "blocked", evidence: "cannot proceed", blockerSummary: "CI down" },
        undefined,
        undefined,
        blocked.ctx,
      ),
    ).resolves.toMatchObject({ details: { thresholdReached: true } });
  });

  it("handles session and turn lifecycle events", async () => {
    const restoredGoal = createGoalState("Restored goal", 1000);
    const { ctx, events } = createHarness({
      entries: [
        { type: "custom", customType: "goal-state", data: restoredGoal },
        { type: "custom", customType: "goal-mode-context", data: { ignored: true } },
      ],
    });

    await events.get("session_start")?.({}, ctx);
    expect(ctx.ui.setStatus).toHaveBeenCalledWith("goal-mode", expect.stringContaining("active"));

    await expect(
      events.get("context")?.(
        { messages: [{ customType: "goal-mode-context" }, { customType: "keep" }] },
        ctx,
      ),
    ).resolves.toEqual({ messages: [{ customType: "keep" }] });

    await expect(
      events.get("before_agent_start")?.({ systemPrompt: "base" }, ctx),
    ).resolves.toMatchObject({ systemPrompt: expect.stringContaining("Restored goal") });

    await events.get("turn_end")?.({ message: { usage: { totalTokens: 0 } } }, ctx);
    await events.get("agent_start")?.({}, ctx);
    await events.get("turn_end")?.(
      { message: { usage: { input: 7, output: 3, totalTokens: 999_999 } } },
      ctx,
    );
    expect(ctx.ui.setStatus).toHaveBeenLastCalledWith(
      "goal-mode",
      expect.stringContaining("active"),
    );

    const empty = createHarness();
    await empty.events.get("session_start")?.({}, empty.ctx);
    await expect(
      empty.events.get("before_agent_start")?.({ systemPrompt: "base" }, empty.ctx),
    ).resolves.toBeUndefined();
    await empty.events.get("agent_start")?.({}, empty.ctx);
    await empty.events.get("turn_end")?.({ message: {} }, empty.ctx);
    expect(empty.ctx.ui.setStatus).toHaveBeenCalledWith("goal-mode", undefined);
  });
});
