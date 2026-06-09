import { existsSync, readFileSync } from "node:fs";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { shortenHome } from "../lib/paths.js";
import type { PicastleRunState } from "./worker.js";

export function sendPicastleBrief(
  pi: ExtensionAPI,
  run: {
    repo: string;
    logPath: string;
    cliArgs: string[];
    env: NodeJS.ProcessEnv;
    profile?: string;
  },
): void {
  pi.sendMessage(
    {
      customType: "picastle-session-brief",
      display: true,
      content: `Picastle has started as a first-class Pi extension command.

Repository: ${run.repo}
Log: ${run.logPath}
Profile: ${run.profile ?? "<none>"}
Command args: ${run.cliArgs.map(shellQuote).join(" ") || "<none>"}
Queue: status=${run.env.PICASTLE_ISSUE_STATUS ?? "policy/default"}${run.env.PICASTLE_ISSUE_LABEL ? ` label=${run.env.PICASTLE_ISSUE_LABEL}` : ""}
Default loop: Picastle plans, implements, reviews/publishes, fans in pending Pebbles intents, then plans again until no unblocked issues remain or PICASTLE_MAX_ITERATIONS is reached (default 20).

How to help:
- Use the picastle_status tool to inspect the latest run and bounded log tail.
- Treat Pebbles as the source of truth. Picastle worktrees live under ~/.cache/picastle/<repo>/worktrees.
- Do not mutate Picastle worktrees, branches, PRs, or Pebbles state unless the user explicitly asks for intervention.
- If Picastle stops or fails, inspect the log/runtime directory, identify the phase (recovery/planner/implementer/reviewer/publisher/fan-in), and propose the smallest recovery step.`,
      details: {
        repo: run.repo,
        logPath: run.logPath,
        cliArgs: run.cliArgs,
        profile: run.profile,
      },
    },
    { deliverAs: "nextTurn" },
  );
}

export function startProgressIndicator(
  ctx: ExtensionCommandContext,
  getRun: () => PicastleRunState | undefined,
): () => void {
  if (!ctx.hasUI) return () => {};

  const frames = ["◐", "◓", "◑", "◒"];
  let frame = 0;
  const render = () => {
    const run = getRun();
    if (!run) return;

    const elapsed = formatElapsed(Date.now() - Date.parse(run.startedAt));
    const latestLine = latestLogLine(run.logPath);
    const phase = inferPhase(latestLine);
    const spinner = frames[frame++ % frames.length];
    ctx.ui.setStatus(
      "picastle",
      ctx.ui.theme.fg("accent", `${spinner} picastle ${phase} ${elapsed}`),
    );
    ctx.ui.setWidget("picastle", [
      `${ctx.ui.theme.fg("accent", "🏰 Picastle running")} · ${shortenHome(run.repo)} · ${elapsed}`,
      `Phase: ${phase}${run.iterationsStarted !== undefined ? ` · iterations: ${run.iterationsStarted}` : ""}`,
      latestLine ? `Latest: ${truncateLine(latestLine, 140)}` : `Log: ${run.logPath}`,
    ]);
  };

  render();
  const interval = setInterval(render, 2000);
  interval.unref?.();
  return () => {
    clearInterval(interval);
    ctx.ui.setStatus("picastle", undefined);
    ctx.ui.setWidget("picastle", undefined);
  };
}

function latestLogLine(logPath: string): string | undefined {
  if (!existsSync(logPath)) return undefined;
  const text = readFileSync(logPath, "utf8");
  return text
    .split("\n")
    .map((line) => line.trim())
    .reverse()
    .find(
      (line) =>
        line.length > 0 && !line.startsWith("# /picastle") && !line.startsWith("# started:"),
    );
}

function inferPhase(line: string | undefined): string {
  if (!line) return "starting";
  if (line.includes("picastle-prep")) return "prep";
  if (line.includes("Recovery") || line.includes("defer:") || line.includes("resume"))
    return "recovery";
  if (line.includes("Planning") || line.includes("Planner") || line.includes("<plan>"))
    return "planning";
  if (line.includes("Implement") || line.includes("implementer")) return "implementing";
  if (line.includes("Reviewing") || line.includes("reviewer")) return "reviewing";
  if (line.includes("Publishing") || line.includes("published") || line.includes("PR"))
    return "publishing";
  if (line.includes("Picastle done")) return "done";
  return "running";
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function truncateLine(line: string, maxChars: number): string {
  return line.length <= maxChars ? line : `${line.slice(0, maxChars - 1)}…`;
}

export function notify(
  ctx: ExtensionCommandContext,
  message: string,
  level: "info" | "warning" | "error",
): void {
  if (ctx.hasUI) ctx.ui.notify(message, level);
  else console.log(message);
}

export function usage(): string {
  return `Usage: /picastle [plan] [dotfiles|ricekit] [--env KEY=VALUE] [-- <picastle args>]

Examples:
  /picastle plan
  /picastle dotfiles plan
  /picastle ricekit -- --max-iterations 1
  /picastle stop
  /picastle -- --repo /path/to/repo

Profiles:
  dotfiles  sets --repo ~/.dotfiles and Pebbles remote dotfiles
  ricekit   sets --repo ~/personal/ricekit.git/main plus RiceKit setup hooks

The default Picastle runner repeats plan → implement → review/publish → fan-in until no unblocked pebbles remain, capped by PICASTLE_MAX_ITERATIONS=20 unless overridden.`;
}

function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:=+-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`;
}
