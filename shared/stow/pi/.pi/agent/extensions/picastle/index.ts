import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Worker } from "node:worker_threads";

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { shortenHome } from "../lib/paths.js";
import { notify, sendPicastleBrief, startProgressIndicator, usage } from "./ui.js";
import {
  LOG_DIR,
  PICASTLE_MAIN,
  PROFILES,
  type PicastleRunState,
  appendLog,
  capturePicastleOutput,
  ensurePlanOnlyArgs,
  formatError,
  hasRepoArg,
  inferProfileEnv,
  parsePicastleArgs,
  repoFromArgs,
  runPicastleWorker,
  tail,
} from "./worker.js";

export default function picastleExtension(pi: ExtensionAPI) {
  let latestRun: PicastleRunState | undefined;
  let activeRun: Promise<void> | undefined;
  let activeWorker: Worker | undefined;
  let stopProgress: (() => void) | undefined;
  let stopping = false;

  const clearPicastleUi = (ctx: ExtensionContext) => {
    ctx.ui.setStatus("picastle", undefined);
    ctx.ui.setWidget("picastle", undefined);
  };

  const stopActiveRun = async () => {
    stopProgress?.();
    stopProgress = undefined;
    const worker = activeWorker;
    activeWorker = undefined;
    if (worker) {
      stopping = true;
      await worker.terminate();
    }
    activeRun = undefined;
    if (latestRun?.status === "running") {
      latestRun = {
        ...latestRun,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: "Stopped by user or Pi session shutdown.",
      };
      appendLog(latestRun.logPath, "\nPicastle stopped by user or Pi session shutdown.\n");
    }
  };

  pi.on("session_start", async (_event, ctx) => {
    clearPicastleUi(ctx);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    await stopActiveRun();
    clearPicastleUi(ctx);
  });

  pi.registerTool({
    name: "picastle_status",
    label: "Picastle Status",
    description: "Inspect the latest /picastle run status and a bounded tail of its log.",
    parameters: Type.Object({
      tailChars: Type.Optional(
        Type.Number({ description: "Log tail size. Defaults to 4000, max 12000." }),
      ),
    }),
    async execute(_toolCallId, params) {
      const tailChars = Math.max(0, Math.min(Number(params.tailChars ?? 4000), 12000));
      if (!latestRun) {
        return {
          content: [{ type: "text", text: "No Picastle run has started in this Pi session." }],
          details: undefined,
        };
      }

      const logTail = existsSync(latestRun.logPath)
        ? tail(readFileSync(latestRun.logPath, "utf8"), tailChars)
        : "<log not found>";
      return {
        content: [
          {
            type: "text",
            text: [
              `status: ${latestRun.status}`,
              `repo: ${latestRun.repo}`,
              `log: ${latestRun.logPath}`,
              latestRun.runtimeDir ? `runtime: ${latestRun.runtimeDir}` : undefined,
              latestRun.iterationsStarted !== undefined
                ? `iterations started: ${latestRun.iterationsStarted}`
                : undefined,
              latestRun.error ? `error: ${latestRun.error}` : undefined,
              "",
              logTail,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
        details: latestRun,
      };
    },
  });

  pi.registerCommand("picastle", {
    description: "Run the Picastle autonomous Pebbles issue runner",
    handler: async (args, ctx) => {
      const parsed = parsePicastleArgs(args ?? "");
      if (parsed.help) {
        notify(ctx, usage(), "info");
        return;
      }
      if (parsed.stop) {
        if (!activeRun) {
          clearPicastleUi(ctx);
          notify(
            ctx,
            "No Picastle run is active in this Pi session. Cleared Picastle UI state.",
            "info",
          );
          return;
        }
        await stopActiveRun();
        clearPicastleUi(ctx);
        notify(ctx, "Picastle stopped.", "info");
        return;
      }

      if (activeRun) {
        notify(
          ctx,
          "Picastle is already running in this Pi session. Use picastle_status for progress.",
          "warning",
        );
        return;
      }

      if (!existsSync(PICASTLE_MAIN)) {
        notify(ctx, `Picastle runner not found: ${PICASTLE_MAIN}`, "error");
        return;
      }

      const profile = parsed.profile ? PROFILES[parsed.profile] : undefined;
      const repo = repoFromArgs(parsed.passthrough) ?? profile?.repo ?? ctx.cwd;
      const passthrough = hasRepoArg(parsed.passthrough)
        ? parsed.passthrough
        : [...parsed.passthrough, "--repo", repo];

      const cliArgs = parsed.planOnly ? ensurePlanOnlyArgs(passthrough) : passthrough;
      const env = {
        ...process.env,
        ...inferProfileEnv(repo),
        ...profile?.env,
        ...parsed.env,
        ...(parsed.planOnly ? { PICASTLE_PLAN_ONLY: "1" } : {}),
      };

      mkdirSync(LOG_DIR, { recursive: true });
      const logPath = join(
        LOG_DIR,
        `picastle-${new Date().toISOString().replace(/[:.]/g, "-")}.log`,
      );
      latestRun = {
        repo,
        logPath,
        startedAt: new Date().toISOString(),
        status: "running",
      };

      sendPicastleBrief(pi, { repo, logPath, cliArgs, env, profile: parsed.profile });
      notify(ctx, `Picastle started for ${shortenHome(repo)}\nLog: ${logPath}`, "info");
      stopProgress = startProgressIndicator(ctx, () => latestRun);

      activeRun = (async () => {
        try {
          const result = await capturePicastleOutput(
            logPath,
            async (onOutput) =>
              await runPicastleWorker({
                cliArgs,
                repo,
                env,
                signal: ctx.signal,
                onOutput,
                onWorker: (worker) => {
                  activeWorker = worker;
                },
              }),
          );
          latestRun = {
            ...latestRun!,
            status: "finished",
            finishedAt: new Date().toISOString(),
            runtimeDir: result.value.runtimeDir,
            iterationsStarted: result.value.iterationsStarted,
          };
          notify(ctx, `Picastle finished\nLog: ${logPath}\n\n${tail(result.output, 2400)}`, "info");
        } catch (error) {
          if (!stopping) {
            latestRun = {
              ...latestRun!,
              status: "failed",
              finishedAt: new Date().toISOString(),
              error: formatError(error),
            };
            appendLog(logPath, `\nPicastle command failed: ${formatError(error)}\n`);
            notify(ctx, `Picastle command failed: ${formatError(error)}\nLog: ${logPath}`, "error");
          }
        } finally {
          stopProgress?.();
          stopProgress = undefined;
          activeWorker = undefined;
          activeRun = undefined;
          stopping = false;
        }
      })();

      return;
    },
  });
}
