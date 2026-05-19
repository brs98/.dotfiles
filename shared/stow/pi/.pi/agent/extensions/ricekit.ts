import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function ricekit(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Custom working indicator with ricekit-colored frames
    // Uses a subtle pulse that matches the ricekit accent palette
    ctx.ui.setWorkingIndicator({
      frames: [
        ctx.ui.theme.fg("dim", "⠋"),
        ctx.ui.theme.fg("muted", "⠙"),
        ctx.ui.theme.fg("accent", "⠹"),
        ctx.ui.theme.fg("accent", "⠸"),
        ctx.ui.theme.fg("accent", "⠼"),
        ctx.ui.theme.fg("accent", "⠴"),
        ctx.ui.theme.fg("muted", "⠦"),
        ctx.ui.theme.fg("dim", "⠧"),
        ctx.ui.theme.fg("dim", "⠇"),
        ctx.ui.theme.fg("dim", "⠏"),
      ],
      intervalMs: 80,
    });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    ctx.ui.setWorkingIndicator();
  });
}
