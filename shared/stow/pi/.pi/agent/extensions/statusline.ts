import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { basename } from "node:path";

const RENDER_INTERVAL_MS = 30_000;
const DIRTY_REFRESH_INTERVAL_MS = 10_000;

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function contextColor(percent: number | null | undefined): "success" | "warning" | "error" | "muted" {
  if (percent === null || percent === undefined) return "muted";
  if (percent >= 90) return "error";
  if (percent >= 70) return "warning";
  return "success";
}

function formatModel(model: unknown): string {
  if (!model || typeof model !== "object") return "no-model";

  const candidate = model as { name?: unknown; id?: unknown };
  if (typeof candidate.name === "string" && candidate.name.length > 0) return candidate.name;
  if (typeof candidate.id === "string" && candidate.id.length > 0) return candidate.id;
  return "model";
}

function formatContextPercent(percent: number | null | undefined): string {
  if (percent === null || percent === undefined) return "?%";
  return `${Math.round(percent)}%`;
}

function joinStyled(parts: string[], separator: string): string {
  return parts.filter(Boolean).join(separator);
}

export default function statusline(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    let dirty = false;
    let disposed = false;

    const refreshDirty = async () => {
      const result = await pi.exec("git", ["status", "--porcelain"], { cwd: ctx.cwd, timeout: 5_000 });
      if (disposed) return;
      dirty = result.code === 0 && result.stdout.trim().length > 0;
    };

    void refreshDirty();
    const dirtyTimer = setInterval(() => void refreshDirty(), DIRTY_REFRESH_INTERVAL_MS);

    ctx.ui.setFooter((tui, theme, footerData) => {
      const sessionStart = Date.parse(ctx.sessionManager.getHeader().timestamp);
      const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());
      const renderTimer = setInterval(() => tui.requestRender(), RENDER_INTERVAL_MS);

      return {
        dispose() {
          disposed = true;
          clearInterval(renderTimer);
          clearInterval(dirtyTimer);
          unsubscribeBranch();
        },
        invalidate() {},
        render(width: number): string[] {
          const separator = theme.fg("dim", " │ ");
          const contextUsage = ctx.getContextUsage();
          const contextPercent = contextUsage?.percent;
          const contextText = theme.fg(contextColor(contextPercent), formatContextPercent(contextPercent));

          const directory = basename(ctx.cwd) || ctx.cwd;
          const branch = footerData.getGitBranch();
          const branchText = branch ? ` ${theme.fg("success", `(${branch}${dirty ? theme.fg("error", "*") : ""})`)}` : "";

          const elapsed = Number.isFinite(sessionStart) ? Date.now() - sessionStart : 0;
          const thinkingLevel = pi.getThinkingLevel();
          const thinkingIcon = thinkingLevel === "off" ? "○" : thinkingLevel === "high" || thinkingLevel === "xhigh" ? "●" : "◑";

          const line = joinStyled(
            [
              theme.fg("accent", formatModel(ctx.model)),
              contextText,
              `${theme.fg("mdCode", directory)}${branchText}`,
              `${theme.fg("dim", "⏱ ")}${formatDuration(elapsed)}`,
              theme.fg(thinkingLevel === "high" || thinkingLevel === "xhigh" ? "thinkingHigh" : "muted", `${thinkingIcon} ${thinkingLevel}`),
            ],
            separator,
          );

          if (visibleWidth(line) <= width) return [line];
          return [truncateToWidth(line, width, theme.fg("dim", "..."))];
        },
      };
    });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setFooter(undefined);
  });
}
