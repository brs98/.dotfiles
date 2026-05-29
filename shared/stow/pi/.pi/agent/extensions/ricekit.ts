import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function ricekit(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Custom working indicator with ricekit-colored frames. The pi-tui render
    // safety guard now truncates final lines on ultra-narrow resize, so the
    // normal Working... loader can stay visible.
    ctx.ui.setWorkingVisible(true);
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
