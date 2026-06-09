import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { AgentProgressEvent, AgentRole, Plan, PlanItem, Show } from "./shared.js";

function progressSummary(content: string): string {
  const first = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!first) return "Pebble orchestrator running...";
  return first.length > 90 ? `${first.slice(0, 87)}...` : first;
}

function compactText(text: string, max = 84): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function swimlaneCell(status: string, lane: "plan" | "implement" | "review" | "verdict"): string {
  const planned = [
    "planned",
    "dispatched",
    "planning",
    "waiting",
    "implementing",
    "implemented",
    "reviewing",
    "approved",
    "opening_pr",
    "pr_opened",
    "changes_requested",
    "failed",
    "blocked",
    "pr_failed",
  ];
  const implemented = [
    "implemented",
    "reviewing",
    "approved",
    "opening_pr",
    "pr_opened",
    "changes_requested",
    "pr_failed",
  ];
  const reviewed = ["approved", "opening_pr", "pr_opened", "pr_failed"];

  if (lane === "plan") {
    if (status === "planning") return "●";
    return planned.includes(status) ? "✓" : "○";
  }
  if (lane === "implement") {
    if (status === "waiting") return "…";
    if (status === "implementing") return "●";
    if (implemented.includes(status)) return "✓";
    if (status === "failed") return "✗";
    return "○";
  }
  if (lane === "review") {
    if (status === "reviewing") return "●";
    if (reviewed.includes(status)) return "✓";
    if (status === "changes_requested") return "✗";
    return "○";
  }
  if (status === "approved") return "approved";
  if (status === "planning") return "planning";
  if (status === "waiting") return "waiting";
  if (status === "opening_pr") return "opening";
  if (status === "pr_opened") return "PR open";
  if (status === "changes_requested") return "changes";
  if (status === "blocked") return "blocked";
  if (status === "failed" || status === "pr_failed") return "failed";
  return "…";
}

function padCell(text: string, width: number): string {
  const compact = truncateToWidth(text, width, "…", true);
  const padding = Math.max(0, width - visibleWidth(compact));
  return `${compact}${" ".repeat(padding)}`;
}

function semanticSwimlaneCell(
  status: string,
  lane: "plan" | "implement" | "review" | "verdict",
  theme: { fg: (name: string, text: string) => string },
): string {
  const cell = swimlaneCell(status, lane);
  if (lane === "plan") {
    if (cell === "●") return theme.fg("accent", cell);
    return theme.fg(cell === "✓" ? "success" : "muted", cell);
  }
  if (lane === "implement") {
    if (cell === "…") return theme.fg("muted", cell);
    if (cell === "●") return theme.fg("accent", cell);
    if (cell === "✓") return theme.fg("success", cell);
    if (cell === "✗") return theme.fg("error", cell);
    return theme.fg("muted", cell);
  }
  if (lane === "review") {
    if (cell === "●") return theme.fg("warning", cell);
    if (cell === "✓") return theme.fg("success", cell);
    if (cell === "✗") return theme.fg("warning", cell);
    return theme.fg("muted", cell);
  }
  if (status === "approved" || status === "pr_opened") return theme.fg("success", cell);
  if (status === "planning") return theme.fg("accent", cell);
  if (status === "waiting") return theme.fg("muted", cell);
  if (status === "opening_pr") return theme.fg("accent", cell);
  if (status === "changes_requested" || status === "blocked") return theme.fg("warning", cell);
  if (status === "failed" || status === "pr_failed") return theme.fg("error", cell);
  return theme.fg("muted", cell);
}

function isKittyReleaseEvent(data: string): boolean {
  // oxlint-disable-next-line no-control-regex -- matches the ESC byte in Kitty keyboard protocol release events.
  return /^\u001B\[\d+(?::\d*)?(?::\d+)?(?:;\d+)?(?::3)u$/.test(data);
}

function isScrollUpInput(data: string): boolean {
  // matchesKey covers legacy VT (raw ctrl+k), Kitty CSI-u, and xterm modifyOtherKeys encodings.
  if (isKittyReleaseEvent(data)) return false;
  return (
    matchesKey(data, "ctrl+k") ||
    matchesKey(data, "ctrl+shift+k") ||
    data === "\x1b[1;3A" ||
    data === "\x1b[3A" ||
    data === "\x1bk"
  );
}

function isScrollDownInput(data: string): boolean {
  // matchesKey covers legacy LF (raw ctrl+j), Kitty CSI-u, and xterm modifyOtherKeys encodings.
  if (isKittyReleaseEvent(data)) return false;
  return (
    matchesKey(data, "ctrl+j") ||
    matchesKey(data, "ctrl+shift+j") ||
    data === "\x1b[1;3B" ||
    data === "\x1b[3B" ||
    data === "\x1bj"
  );
}

export function createUi(show: Show) {
  let activeScrollController: { scrollBy: (delta: number) => boolean } | undefined;

  function scrollActiveWidget(delta: number): boolean {
    return activeScrollController?.scrollBy(delta) ?? false;
  }

  function makeUiProgress(ctx: {
    hasUI?: boolean;
    ui?: {
      notify?: (message: string, level?: "info" | "warning" | "error") => void;
      onTerminalInput?: (
        handler: (data: string) => { consume?: boolean; data?: string } | undefined,
      ) => () => void;
      setStatus?: (key: string, value: string | undefined) => void;
      setWidget?: (
        key: string,
        value:
          | ((
              tui: unknown,
              theme: unknown,
            ) => {
              render: (width: number) => string[];
              invalidate: () => void;
              dispose?: () => void;
            })
          | undefined,
        options?: { placement?: "aboveEditor" | "belowEditor" },
      ) => void;
    };
  }): {
    progress: (content: string, details?: unknown) => void;
    onPlan: (plan: Plan) => void;
    onItemStatus: (item: PlanItem, status: string, details?: unknown) => void;
    onAgentEvent: (event: AgentProgressEvent) => void;
    dispose: () => void;
  } {
    type WidgetItem = {
      id: string;
      title: string;
      branch: string;
      worktree: string;
      status: string;
      startedAt: number;
      updatedAt: number;
      latest?: string;
      role?: AgentRole;
      agentElapsedMs?: number;
      roleStartedAt?: number;
    };

    const startedAt = Date.now();
    const items = new Map<string, WidgetItem>();
    let plan: Plan | undefined;
    let stage = "Starting...";
    let disposed = false;
    let requestWidgetRender: (() => void) | undefined;
    let unsubscribeTerminalInput: (() => void) | undefined;

    const buildLines = (theme: {
      fg: (name: string, text: string) => string;
      bold: (text: string) => string;
    }): string[] => {
      const lines = [theme.fg("muted", `Stage: ${compactText(stage, 90)}`)];
      if (plan) lines.push(theme.fg("muted", `Repo: ${compactText(plan.repo, 90)}`));
      const selected = [...items.values()];
      if (selected.length > 0) {
        lines.push("");
        lines.push(
          `${theme.bold(padCell("Pebble", 12))}  ${theme.bold(padCell("Plan", 6))} ${theme.bold(padCell("Implement", 10))} ${theme.bold(padCell("Review", 8))} ${theme.bold(padCell("Verdict", 12))}`,
        );
        lines.push(theme.fg("muted", "────────────  ────── ────────── ──────── ────────────"));
        for (const item of selected) {
          lines.push(
            `${padCell(item.id, 12)}  ${padCell(semanticSwimlaneCell(item.status, "plan", theme), 6)} ${padCell(semanticSwimlaneCell(item.status, "implement", theme), 10)} ${padCell(semanticSwimlaneCell(item.status, "review", theme), 8)} ${padCell(semanticSwimlaneCell(item.status, "verdict", theme), 12)}`,
          );
          lines.push(`  ${theme.fg("muted", compactText(item.status + " · " + item.title, 92))}`);
          if (item.role || item.latest)
            lines.push(`  ${compactText([item.role, item.latest].filter(Boolean).join(": "), 92)}`);
          lines.push(`  ${theme.fg("dim", compactText(item.branch, 92))}`);
        }
      }

      const deferred = plan?.items.filter((item) => !plan?.selected.includes(item)) ?? [];
      if (deferred.length > 0) {
        lines.push("", theme.fg("muted", "Deferred"));
        for (const item of deferred)
          lines.push(
            `○ ${item.issue.id} ${theme.fg("dim", compactText(item.blockingReasons.join("; ") || "not selected", 74))}`,
          );
      }

      return lines;
    };

    const render = () => {
      if (!ctx.hasUI || disposed) return;
      ctx.ui?.setStatus?.("pebble-orchestrator", `Pebbles: ${stage}`);
      requestWidgetRender?.();
    };

    if (ctx.hasUI) {
      unsubscribeTerminalInput = ctx.ui?.onTerminalInput?.((data) => {
        if (isScrollUpInput(data)) {
          scrollActiveWidget(-1);
          return { consume: true };
        }
        if (isScrollDownInput(data)) {
          scrollActiveWidget(1);
          return { consume: true };
        }
        return undefined;
      });

      ctx.ui?.setWidget?.(
        "pebble-orchestrator",
        (tuiUnknown, themeUnknown) => {
          const tui = tuiUnknown as {
            requestRender?: () => void;
          };
          const theme = themeUnknown as {
            fg: (name: string, text: string) => string;
            bold: (text: string) => string;
          };
          let scroll = 0;
          const maxBodyLines = 16;
          const scrollBy = (delta: number): boolean => {
            const maxScroll = Math.max(0, buildLines(theme).length - maxBodyLines);
            if (maxScroll === 0) return false;
            const nextScroll = Math.max(0, Math.min(maxScroll, scroll + delta));
            if (nextScroll !== scroll) {
              scroll = nextScroll;
              tui.requestRender?.();
              return true;
            }
            return false;
          };
          const controller = { scrollBy };
          activeScrollController = controller;
          requestWidgetRender = () => tui.requestRender?.();

          return {
            render(width: number): string[] {
              const border = (text: string) => theme.fg("border", text);
              const title = theme.fg("accent", theme.bold(" Pebble orchestrator "));
              const innerWidth = Math.max(1, width - 2);
              const visibleTitle = truncateToWidth(title, innerWidth, "", true);
              const titleWidth = visibleWidth(visibleTitle);
              const left = Math.max(0, Math.floor((innerWidth - titleWidth) / 2));
              const right = Math.max(0, innerWidth - titleWidth - left);
              const body = buildLines(theme);
              const maxScroll = Math.max(0, body.length - maxBodyLines);
              scroll = Math.min(scroll, maxScroll);
              const visible = body.slice(scroll, scroll + maxBodyLines);
              const padLine = (line: string) => {
                if (innerWidth <= 2) {
                  const truncated = truncateToWidth(line, innerWidth, "…", true);
                  return `${truncated}${" ".repeat(Math.max(0, innerWidth - visibleWidth(truncated)))}`;
                }
                const contentWidth = innerWidth - 2;
                const truncated = truncateToWidth(line, contentWidth, "…", true);
                return ` ${truncated}${" ".repeat(Math.max(0, contentWidth - visibleWidth(truncated)))} `;
              };
              const lines = [
                border(`╭${"─".repeat(left)}`) + visibleTitle + border(`${"─".repeat(right)}╮`),
              ];
              for (const line of visible) lines.push(border("│") + padLine(line) + border("│"));
              while (lines.length < maxBodyLines + 1)
                lines.push(border("│") + padLine("") + border("│"));
              const hint =
                maxScroll > 0
                  ? theme.fg(
                      "dim",
                      `ctrl+j/k scroll; /pebbles scroll up/down ${scroll + 1}/${maxScroll + 1}`,
                    )
                  : theme.fg("dim", "all progress visible");
              lines.push(border("│") + padLine(hint) + border("│"));
              lines.push(border(`╰${"─".repeat(innerWidth)}╯`));
              return lines;
            },
            invalidate() {},
            dispose() {
              if (activeScrollController === controller) activeScrollController = undefined;
            },
          };
        },
        { placement: "aboveEditor" },
      );
    }

    const interval = setInterval(render, 1000);

    return {
      progress(content, details) {
        show(content, details);
        stage = progressSummary(content);
        render();
      },
      onPlan(nextPlan) {
        plan = nextPlan;
        items.clear();
        for (const item of nextPlan.selected) {
          items.set(item.issue.id, {
            id: item.issue.id,
            title: item.issue.title,
            branch: item.branch,
            worktree: item.worktreePath,
            status: "planned",
            startedAt,
            updatedAt: Date.now(),
          });
        }
        render();
      },
      onItemStatus(item, status, details) {
        const existing = items.get(item.issue.id) ?? {
          id: item.issue.id,
          title: item.issue.title,
          branch: item.branch,
          worktree: item.worktreePath,
          status: "planned",
          startedAt: Date.now(),
          updatedAt: Date.now(),
        };
        const record =
          details && typeof details === "object" ? (details as Record<string, unknown>) : {};
        const errors = Array.isArray(record.errors) ? record.errors.join("; ") : undefined;
        if (typeof record.worktreePath === "string") existing.worktree = record.worktreePath;
        existing.status = status;
        if (status === "planning" || status === "implementing" || status === "reviewing")
          existing.roleStartedAt = Date.now();
        existing.updatedAt = Date.now();
        existing.latest =
          typeof record.error === "string" ? record.error : errors || existing.latest;
        items.set(item.issue.id, existing);
        stage = `${item.issue.id}: ${status}`;
        render();
      },
      onAgentEvent(event) {
        const item = items.get(event.issueId);
        if (!item) return;
        item.role = event.role;
        if (!item.roleStartedAt || event.phase === "started")
          item.roleStartedAt = Date.now() - event.elapsedMs;
        item.agentElapsedMs = event.elapsedMs;
        item.latest = event.text;
        item.updatedAt = Date.now();
        if (
          ![
            "approved",
            "changes_requested",
            "blocked",
            "failed",
            "pr_opened",
            "pr_failed",
          ].includes(item.status)
        ) {
          item.status =
            event.role === "planner"
              ? "planning"
              : event.role === "implementer"
                ? "implementing"
                : "reviewing";
        }
        stage = `${event.issueId}: ${compactText(event.text, 52)}`;
        render();
      },
      dispose() {
        disposed = true;
        clearInterval(interval);
        activeScrollController = undefined;
        unsubscribeTerminalInput?.();
        unsubscribeTerminalInput = undefined;
        if (!ctx.hasUI) return;
        ctx.ui?.setStatus?.("pebble-orchestrator", undefined);
        ctx.ui?.setWidget?.("pebble-orchestrator", undefined);
      },
    };
  }

  return { scrollActiveWidget, makeUiProgress };
}
