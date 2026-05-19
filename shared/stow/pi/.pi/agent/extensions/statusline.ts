import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { basename } from "node:path";

const DIRTY_REFRESH_INTERVAL_MS = 10_000;

function contextColor(percent: number | null | undefined): "success" | "warning" | "error" | "muted" {
  if (percent === null || percent === undefined) return "muted";
  if (percent >= 90) return "error";
  if (percent >= 70) return "warning";
  return "success";
}

function formatModel(model: unknown): string {
  if (!model || typeof model !== "object") return "no-model";

  if ("name" in model && typeof (model as Record<string, unknown>).name === "string" && (model as Record<string, unknown>).name) {
    return (model as Record<string, unknown>).name as string;
  }
  if ("id" in model && typeof (model as Record<string, unknown>).id === "string" && (model as Record<string, unknown>).id) {
    return (model as Record<string, unknown>).id as string;
  }
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
      const unsubscribeBranch = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose() {
          disposed = true;
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

          // Calculate accumulated cost from all session entries
          let totalCost = 0;

          for (const e of ctx.sessionManager.getBranch()) {
            if (e.type === "message" && e.message.role === "assistant") {
              totalCost += e.message.usage.cost.total;
            }
          }

          // Build usage stats (accumulated cost only)
          const usageParts: string[] = [];

          const usingSubscription = ctx.model ? ctx.modelRegistry.isUsingOAuth(ctx.model) : false;
          if (totalCost || usingSubscription) {
            const costStr = `$${totalCost.toFixed(3)}${usingSubscription ? " (sub)" : ""}`;
            usageParts.push(costStr);
          }

          const line = joinStyled(
            [
              theme.fg("accent", formatModel(ctx.model)),
              contextText,
              `${theme.fg("mdCode", directory)}${branchText}`,
              usageParts.length > 0 ? theme.fg("dim", usageParts.join(" ")) : "",
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
