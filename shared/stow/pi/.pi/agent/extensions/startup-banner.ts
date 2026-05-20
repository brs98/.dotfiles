import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
  let bannerVisible = false;

  // Show the banner on every session start, persistently above the editor.
  // Keep it compact: no spacer rows and no trailing whitespace.
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    const art = [
      "       __                               _",
      "  ____/ /__ _   ___  ______  ___  _____(_)__  ____  ________",
      " / __  / _ \\ | / / |/_/ __ \\/ _ \\/ ___/ / _ \\/ __ \\/ ___/ _ \\",
      "/ /_/ /  __/ |/ />  </ /_/ /  __/ /  / /  __/ / / / /__/  __/",
      "\\__,_/\\___/|___/_/|_/ .___/\\___/_/  /_/\\___/_/ /_/\\___/\\___/",
      "                   /_/",
    ];

    bannerVisible = true;
    ctx.ui.setWidget("startup-banner", (_tui, theme) => {
      return {
        render: (width: number) => art.map((line) => truncateToWidth(theme.fg("accent", line), width, "")),
        invalidate: () => {},
      };
    });
  });

  // Hide the banner as soon as the first real prompt starts running.
  pi.on("before_agent_start", async (_event, ctx) => {
    if (!bannerVisible || !ctx.hasUI) return;
    ctx.ui.setWidget("startup-banner", undefined);
    bannerVisible = false;
  });

  // Optional: command to hide it when you want the space back.
  pi.registerCommand("hide-banner", {
    description: "Hide the startup banner",
    handler: async (_args, ctx) => {
      ctx.ui.setWidget("startup-banner", undefined);
      bannerVisible = false;
      ctx.ui.notify("Banner hidden", "info");
    },
  });
}
