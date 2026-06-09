import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { choosePokemonForSubagent } from "./assets/pokemon-art.js";
import {
  DEFAULT_TIMEOUT_MS,
  maybeTruncateOutput,
  runSubagent,
  type SubagentDetails,
} from "./runner.js";
import { renderPokemonPreviewLines, renderSubagentCall, renderSubagentResult } from "./ui.js";

const SubagentParams = Type.Object({
  task: Type.String({
    description:
      "Focused task for the subagent to complete. Include all context the subagent needs.",
  }),
  role: Type.Optional(
    Type.String({
      description:
        "Optional role or operating instructions for the subagent, e.g. 'researcher', 'reviewer', or a detailed persona.",
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description:
        "Working directory for the subagent. Relative paths resolve against the current pi cwd.",
    }),
  ),
  model: Type.Optional(
    Type.String({
      description:
        "Optional pi model pattern/id for the subagent, e.g. 'sonnet:high' or 'openai/gpt-5.5'.",
    }),
  ),
  tools: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Optional allowlist of tool names for the subagent, e.g. ['read','grep','find','ls'].",
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Number({
      description: `Timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.`,
    }),
  ),
});

export default function subagent(pi: ExtensionAPI) {
  pi.registerCommand("pokemon-subagent-preview", {
    description: "Preview themed Pokémon subagent cards without running subagents",
    handler: async (_args, ctx) => {
      await ctx.ui.custom<null>((_tui, theme, _keybindings, done) => ({
        invalidate() {},
        handleInput(data: string) {
          if (data === "\x1b" || data === "\u0003") done(null);
        },
        render(width: number) {
          return renderPokemonPreviewLines(theme, ctx.cwd, width);
        },
      }));
    },
  });

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description:
      "Delegate a focused task to a separate pi process with an isolated context window. Useful for research, exploration, review, and parallelizable analysis. Output is truncated to safe limits if necessary.",
    promptSnippet:
      "Delegate focused research, exploration, review, or analysis to an isolated pi process.",
    promptGuidelines: [
      "Use subagent for focused research or analysis tasks that would otherwise clutter the main context.",
      "Give subagent all relevant context in the task because it runs in an isolated session.",
      "Prefer read-only tools for exploratory subagent tasks unless the user explicitly asks for implementation work.",
    ],
    parameters: SubagentParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const cwd = params.cwd ? resolve(ctx.cwd, params.cwd) : ctx.cwd;
      const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      const details = await runSubagent({
        task: params.task,
        role: params.role,
        cwd,
        model: params.model,
        tools: params.tools,
        timeoutMs,
        signal,
        onUpdate: (text) => {
          onUpdate?.({
            content: [{ type: "text", text: text || "(subagent running...)" }],
            details: {
              task: params.task,
              role: params.role,
              cwd,
              model: params.model,
              pokemon: choosePokemonForSubagent({
                task: params.task,
                role: params.role,
                model: params.model,
                cwd,
              }),
              exitCode: null,
              durationMs: 0,
              finalOutput: text,
              stderr: "",
              usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
            } satisfies SubagentDetails,
          });
        },
      });

      const output = await maybeTruncateOutput(details);
      const isError = details.exitCode !== 0;
      const text = isError
        ? `Subagent failed with exit code ${details.exitCode}.\n\n${output}`
        : output;

      return {
        content: [{ type: "text", text }],
        details,
      };
    },

    renderCall(args, theme) {
      return renderSubagentCall(args, theme);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      return renderSubagentResult(
        result.details as SubagentDetails | undefined,
        { expanded, isPartial },
        theme,
      );
    },
  });
}
