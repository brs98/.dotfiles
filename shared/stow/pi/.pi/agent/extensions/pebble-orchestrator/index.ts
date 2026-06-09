import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { parseArgs, parseRunOptions, pebblesArgumentCompletions } from "./cli.js";
import { createDispatcher, formatRunResults } from "./dispatch.js";
import { createPebOps } from "./peb.js";
import { createPlanning, deriveWorkflow, formatPlan, formatTriageQueue } from "./plan.js";
import { DEFAULT_CONCURRENCY, formatError, type RunResult } from "./shared.js";
import { createUi } from "./ui.js";

const PebPlanParams = Type.Object({
  repo: Type.Optional(
    Type.String({ description: "Pebbles workspace or path inside it. Defaults to current cwd." }),
  ),
  concurrency: Type.Optional(
    Type.Number({
      description: `Maximum parallel ready pebbles to select. Default: ${DEFAULT_CONCURRENCY}.`,
    }),
  ),
  state: Type.Optional(
    Type.String({
      description:
        "Pickup label. Defaults to ready-for-agent when present, otherwise all open issues.",
    }),
  ),
});

const PebSyncParams = Type.Object({
  repo: Type.Optional(
    Type.String({ description: "Pebbles workspace or path inside it. Defaults to current cwd." }),
  ),
  dryRun: Type.Optional(
    Type.Boolean({ description: "Report what would sync without mutating Pebbles." }),
  ),
});

export default function pebbleOrchestrator(pi: ExtensionAPI) {
  const ops = createPebOps(pi);
  const { checked, detect, loadPolicy } = ops;

  function show(content: string, details?: unknown): void {
    pi.sendMessage({ customType: "pebble-orchestrator", content, display: true, details });
  }

  const { createPlan, listTriageIssues, runInteractiveTriage } = createPlanning(ops, show);
  const { runReady } = createDispatcher(pi, ops, createPlan);
  const { scrollActiveWidget, makeUiProgress } = createUi(show);

  pi.registerCommand("pebbles", {
    description:
      "Pebbles cockpit: triage pebbles while dispatching ready work to AFK worktree agents",
    getArgumentCompletions: pebblesArgumentCompletions,
    handler: async (args, ctx) => {
      const parsed = parseArgs(args);
      const first = parsed.positionals[0]?.toLowerCase();
      const dryRun = Boolean(parsed.flags["dry-run"] || parsed.flags.dryRun);
      const autoPr = Boolean(parsed.flags["auto-pr"] || parsed.flags.autoPr);
      const noDispatch = Boolean(parsed.flags["no-dispatch"] || parsed.flags.noDispatch);

      if (first === "scroll") {
        const direction = parsed.positionals[1]?.toLowerCase() || "down";
        const delta =
          direction === "up"
            ? -1
            : direction === "page-up" || direction === "pageup"
              ? -8
              : direction === "page-down" || direction === "pagedown"
                ? 8
                : 1;
        const scrolled = scrollActiveWidget(delta);
        if (ctx.hasUI)
          ctx.ui.notify(
            scrolled
              ? `Pebble card scrolled ${direction}`
              : "No active Pebbles card to scroll, or no more overflow.",
            scrolled ? "info" : "warning",
          );
        return;
      }

      if (first === "plan") {
        try {
          const options = parseRunOptions(args, ctx.cwd, 1);
          const plan = await createPlan(options);
          const { repo } = await detect(options.repo, ctx.cwd);
          const triageIssues = await listTriageIssues(repo, deriveWorkflow(await loadPolicy(repo)));
          show(`${formatPlan(plan)}\n\n${formatTriageQueue(triageIssues)}`, {
            plan,
            triageIssues,
          });
        } catch (error) {
          show(`pebbles plan failed: ${formatError(error)}`);
        }
        return;
      }

      if (first === "sync") {
        try {
          const { repo } = await detect(parsed.positionals[1], ctx.cwd);
          const syncArgs = ["sync", "github"];
          if (dryRun) syncArgs.push("--dry-run");
          const result = await checked("peb", syncArgs, repo, 120_000);
          show(result.stdout.trim() || "peb sync github completed.");
        } catch (error) {
          show(`pebbles sync failed: ${formatError(error)}`);
        }
        return;
      }

      const triageOnly = first === "triage" || Boolean(parsed.flags["triage-only"]);
      const runOnly = first === "run" || first === "run-ready" || first === "burn-down";
      const positionalOffset = first === "triage" || runOnly ? 1 : 0;
      const options = parseRunOptions(args, ctx.cwd, positionalOffset);
      const shouldDispatch = !dryRun && !noDispatch && !triageOnly;
      const shouldCreatePrs = autoPr || first === "burn-down";
      const uiProgress = makeUiProgress(ctx);

      try {
        uiProgress.progress(
          `Starting /pebbles for ${options.repo ?? ctx.cwd}${dryRun ? " (dry run)" : ""}.`,
          options,
        );
        if (dryRun) {
          const plan = await createPlan(options);
          const { repo } = await detect(options.repo, ctx.cwd);
          const triageIssues = await listTriageIssues(repo, deriveWorkflow(await loadPolicy(repo)));
          show(`${formatPlan(plan)}\n\n${formatTriageQueue(triageIssues)}`, {
            plan,
            triageIssues,
            dryRun: true,
          });
          return;
        }

        const runPromise = shouldDispatch
          ? runReady({
              ...options,
              createPrs: shouldCreatePrs,
              onProgress: uiProgress.progress,
              onPlan: uiProgress.onPlan,
              onItemStatus: uiProgress.onItemStatus,
              onAgentEvent: uiProgress.onAgentEvent,
            })
          : createPlan(options).then((plan) => ({ plan, results: [] as RunResult[] }));

        const triagePromise = runOnly
          ? Promise.resolve()
          : runInteractiveTriage(ctx, {
              repo: options.repo,
              dryRun: false,
            });

        const [{ plan, results }] = await Promise.all([runPromise, triagePromise]);
        const triageIssues =
          results.length === 0 ? await listTriageIssues(plan.repo, plan.workflow) : [];
        const triageSummary = results.length === 0 ? `\n\n${formatTriageQueue(triageIssues)}` : "";
        show(`${formatPlan(plan)}\n\n${formatRunResults(results)}${triageSummary}`, {
          plan,
          results,
          triageIssues,
          autoPr: shouldCreatePrs,
        });
      } catch (error) {
        show(`pebbles failed: ${formatError(error)}`);
      } finally {
        uiProgress.dispose();
      }
    },
  });

  const registerScrollShortcut = (
    key: Parameters<ExtensionAPI["registerShortcut"]>[0],
    delta: number,
    direction: "up" | "down",
  ) => {
    pi.registerShortcut(key, {
      description: `Scroll Pebbles orchestrator card ${direction}`,
      handler: async (ctx) => {
        const scrolled = scrollActiveWidget(delta);
        if (!scrolled && ctx.hasUI)
          ctx.ui.notify(`No active Pebbles card to scroll ${direction}.`, "warning");
      },
    });
  };

  registerScrollShortcut("ctrl+shift+j", 1, "down");
  registerScrollShortcut("ctrl+shift+k", -1, "up");

  pi.registerTool({
    name: "peb_plan",
    label: "Pebble Plan",
    description:
      "Inspect a Pebbles workspace and produce a ready/unblocked execution plan. Does not mutate Pebbles or git.",
    promptSnippet: "Plan ready Pebbles work without mutating the workspace.",
    promptGuidelines: [
      "Use peb_plan when the user asks what Pebbles work is ready or wants an execution plan.",
    ],
    parameters: PebPlanParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const plan = await createPlan({
        repo: params.repo,
        cwd: ctx.cwd,
        concurrency: params.concurrency ?? DEFAULT_CONCURRENCY,
        state: params.state,
      });
      return { content: [{ type: "text", text: formatPlan(plan) }], details: plan };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("peb_plan ")) + theme.fg("accent", args.repo ?? "cwd"),
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "peb_sync_github",
    label: "Pebble Sync",
    description:
      "Run peb sync github for a Pebbles workspace. Finalizes pending PR close declarations after merge.",
    promptSnippet: "Sync Pebbles PR close declarations from GitHub after PRs merge.",
    promptGuidelines: [
      "Use peb_sync_github only when the user asks to sync completed Pebbles PR closures.",
    ],
    parameters: PebSyncParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { repo } = await detect(params.repo, ctx.cwd);
      const args = ["sync", "github"];
      if (params.dryRun) args.push("--dry-run");
      const result = await checked("peb", args, repo, 120_000);
      return {
        content: [{ type: "text", text: result.stdout.trim() || "peb sync github completed." }],
        details: { repo, dryRun: params.dryRun ?? false },
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("peb_sync_github ")) +
          theme.fg("accent", args.repo ?? "cwd"),
        0,
        0,
      );
    },
  });
}
