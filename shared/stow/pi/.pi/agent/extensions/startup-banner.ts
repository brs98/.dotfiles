import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
  const art = [
    "       __                               _",
    "  ____/ /__ _   ___  ______  ___  _____(_)__  ____  ________",
    " / __  / _ \\ | / / |/_/ __ \\/ _ \\/ ___/ / _ \\/ __ \\/ ___/ _ \\",
    "/ /_/ /  __/ |/ />  </ /_/ /  __/ /  / /  __/ / / / /__/  __/",
    "\\__,_/\\___/|___/_/|_/ .___/\\___/_/  /_/\\___/_/ /_/\\___/\\___/",
    "                   /_/",
  ];

  let bannerVisible = false;
  let bannerDismissed = false;
  let activeCtx: ExtensionContext | undefined;

  function branchHasConversation(ctx: {
    sessionManager: { getBranch(): Array<{ type: string }> };
  }): boolean {
    return ctx.sessionManager.getBranch().some((entry) => entry.type === "message");
  }

  function branchHasDismissal(ctx: {
    sessionManager: { getEntries(): Array<{ type: string; customType?: string }> };
  }): boolean {
    return ctx.sessionManager
      .getEntries()
      .some((entry) => entry.type === "custom" && entry.customType === "startup-banner-dismissed");
  }

  function hideBanner(ctx = activeCtx, notify = false) {
    if (!ctx?.hasUI) return;

    if (bannerVisible) {
      ctx.ui.setWidget("startup-banner", undefined);
      bannerVisible = false;
    }

    if (!bannerDismissed) {
      bannerDismissed = true;
      pi.appendEntry("startup-banner-dismissed", { dismissedAt: Date.now() });
    }

    if (notify) ctx.ui.notify("Banner hidden", "info");
  }

  // Hide even when the first submitted prompt is handled as a slash command.
  // Pi's input/before_agent_start events do not fire for those commands.
  const unsubscribeDismissEvent = pi.events.on("devx:startup-banner:dismiss", () => hideBanner());

  // Show only for a fresh, empty startup session. Do not re-show after /reload,
  // /fork, or when resuming a session that already has conversation history.
  pi.on("session_start", async (event, ctx) => {
    activeCtx = ctx;
    bannerVisible = false;
    bannerDismissed = branchHasDismissal(ctx) || branchHasConversation(ctx);

    if (!ctx.hasUI || event.reason !== "startup" || bannerDismissed) {
      ctx.ui.setWidget("startup-banner", undefined);
      return;
    }

    bannerVisible = true;
    ctx.ui.setWidget("startup-banner", (_tui, theme) => {
      return {
        render: (width: number) =>
          art.map((line) => truncateToWidth(theme.fg("accent", line), width, "")),
        invalidate: () => {},
      };
    });
  });

  // Hide as soon as any non-command prompt enters the agent path. `input`
  // fires earlier than `before_agent_start`, so the widget is gone while the
  // prompt is being expanded and queued.
  pi.on("input", async (_event, ctx) => hideBanner(ctx));
  pi.on("before_agent_start", async (_event, ctx) => hideBanner(ctx));
  pi.on("session_shutdown", async () => {
    unsubscribeDismissEvent();
    activeCtx = undefined;
  });

  // Optional: command to hide it when you want the space back.
  pi.registerCommand("hide-banner", {
    description: "Hide the startup banner",
    handler: async (_args, ctx) => hideBanner(ctx, true),
  });
}
