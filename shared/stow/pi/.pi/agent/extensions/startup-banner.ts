import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Show the banner on every session start, persistently above the editor
  pi.on("session_start", async (_event, ctx) => {
    const art = [
      "",
      "       __                               _                    ",
      "  ____/ /__ _   ___  ______  ___  _____(_)__  ____  ________ ",
      " / __  / _ \\ | / / |/_/ __ \\/ _ \\/ ___/ / _ \\/ __ \\/ ___/ _ \\",
      "/ /_/ /  __/ |/ />  </ /_/ /  __/ /  / /  __/ / / / /__/  __/",
      "\\__,_/\\___/|___/_/|_/ .___/\\___/_/  /_/\\___/_/ /_/\\___/\\___/ ",
      "                   /_/                                       ",
      "",
    ];

    ctx.ui.setWidget("startup-banner", (_tui, theme) => {
      return {
        render: () => art.map((line) => theme.fg("accent", line)),
        invalidate: () => {},
      };
    });
  });

  // Optional: command to hide it when you want the space back
  pi.registerCommand("hide-banner", {
    description: "Hide the startup banner",
    handler: async (_args, ctx) => {
      ctx.ui.setWidget("startup-banner", undefined);
      ctx.ui.notify("Banner hidden", "info");
    },
  });
}
