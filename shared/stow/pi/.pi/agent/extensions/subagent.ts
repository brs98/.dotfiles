import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateTail,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import {
  encodeITerm2,
  getCapabilities,
  getCellDimensions,
  Text,
  truncateToWidth,
  visibleWidth,
  type Component,
} from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
  choosePokemonForSubagent,
  getPokemonArt,
  renderPokemonArt,
  renderPokemonPng,
  type PokemonName,
} from "./subagent-assets/pokemon-subagent-art.js";

type MessageContent = { type: "text"; text: string } | { type: string; [key: string]: unknown };
type AssistantMessage = {
  role: string;
  content?: MessageContent[];
  model?: string;
  provider?: string;
  stopReason?: string;
  errorMessage?: string;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
    cost?: { total?: number };
  };
};

type SubagentDetails = {
  task: string;
  role?: string;
  cwd: string;
  model?: string;
  pokemon: PokemonName;
  exitCode: number | null;
  durationMs: number;
  finalOutput: string;
  stderr: string;
  usage: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    cost: number;
    turns: number;
  };
  truncated?: boolean;
  fullOutputPath?: string;
};

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const KILL_GRACE_MS = 5_000;

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

function getPiInvocation(args: string[]): { command: string; args: string[] } {
  const currentScript = process.argv[1];
  const isBunVirtualScript = currentScript?.startsWith("/$bunfs/root/");

  if (currentScript && !isBunVirtualScript && existsSync(currentScript)) {
    return { command: process.execPath, args: [currentScript, ...args] };
  }

  const execName = basename(process.execPath).toLowerCase();
  const isGenericRuntime = /^(node|bun)(\.exe)?$/.test(execName);
  if (!isGenericRuntime) return { command: process.execPath, args };

  return { command: "pi", args };
}

function getText(message: AssistantMessage): string {
  return (message.content ?? [])
    .filter(
      (part): part is { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("\n");
}

function buildPrompt(task: string, role: string | undefined): string {
  const parts = [
    "You are a focused subagent running in an isolated pi session.",
    "Complete only the delegated task. Keep your final response concise and actionable.",
    "Do not recursively call subagents unless the user explicitly asked for nested delegation.",
  ];

  if (role?.trim()) {
    parts.push("", "Role / operating instructions:", role.trim());
  }

  parts.push("", "Delegated task:", task);
  return parts.join("\n");
}

function buildArgs(params: {
  task: string;
  role?: string;
  model?: string;
  tools?: string[];
}): string[] {
  const args = ["--mode", "json", "--no-session", "-p"];

  if (params.model) args.push("--model", params.model);
  if (params.tools && params.tools.length > 0) args.push("--tools", params.tools.join(","));

  args.push(buildPrompt(params.task, params.role));
  return args;
}

function applyUsage(details: SubagentDetails, message: AssistantMessage): void {
  if (message.role !== "assistant") return;
  details.usage.turns += 1;

  const usage = message.usage;
  if (!usage) return;

  details.usage.input += usage.input ?? 0;
  details.usage.output += usage.output ?? 0;
  details.usage.cacheRead += usage.cacheRead ?? 0;
  details.usage.cacheWrite += usage.cacheWrite ?? 0;
  details.usage.cost += usage.cost?.total ?? 0;
}

async function maybeTruncateOutput(details: SubagentDetails): Promise<string> {
  const combinedOutput = details.finalOutput || details.stderr || "(no output)";
  const truncation = truncateTail(combinedOutput, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  if (!truncation.truncated) return truncation.content;

  const tempDir = await mkdtemp(join(tmpdir(), "pi-subagent-"));
  const outputPath = join(tempDir, "output.txt");
  await withFileMutationQueue(outputPath, async () => {
    await writeFile(outputPath, combinedOutput, "utf8");
  });

  details.truncated = true;
  details.fullOutputPath = outputPath;
  details.finalOutput = truncation.content;
  if (details.stderr && combinedOutput === details.stderr) details.stderr = truncation.content;

  return `${truncation.content}\n\n[Subagent output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(
    truncation.outputBytes,
  )} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${outputPath}]`;
}

async function runSubagent(params: {
  task: string;
  role?: string;
  cwd: string;
  model?: string;
  tools?: string[];
  timeoutMs: number;
  signal?: AbortSignal;
  onUpdate?: (text: string) => void;
}): Promise<SubagentDetails> {
  const startedAt = Date.now();
  const details: SubagentDetails = {
    task: params.task,
    role: params.role,
    cwd: params.cwd,
    model: params.model,
    pokemon: choosePokemonForSubagent(params),
    exitCode: null,
    durationMs: 0,
    finalOutput: "",
    stderr: "",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
  };

  const invocation = getPiInvocation(buildArgs(params));

  await new Promise<void>((resolvePromise) => {
    const proc = spawn(invocation.command, invocation.args, {
      cwd: params.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let settled = false;

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      details.exitCode = exitCode;
      details.durationMs = Date.now() - startedAt;
      clearTimeout(timeoutTimer);
      resolvePromise();
    };

    const kill = (reason: string) => {
      if (settled) return;
      details.stderr += details.stderr ? `\n${reason}` : reason;
      proc.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) proc.kill("SIGKILL");
      }, KILL_GRACE_MS);
    };

    const timeoutTimer = setTimeout(
      () => kill(`Subagent timed out after ${params.timeoutMs}ms.`),
      params.timeoutMs,
    );

    const processLine = (line: string) => {
      if (!line.trim()) return;

      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }

      if (!event || typeof event !== "object") return;
      const candidate = event as { type?: unknown; message?: unknown };
      if (
        candidate.type !== "message_end" ||
        !candidate.message ||
        typeof candidate.message !== "object"
      )
        return;

      const message = candidate.message as AssistantMessage;
      if (message.role !== "assistant") return;

      const text = getText(message);
      if (text) {
        details.finalOutput = text;
        params.onUpdate?.(text);
      }

      if (typeof message.model === "string") details.model = message.model;
      applyUsage(details, message);
    };

    proc.stdout.on("data", (data) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });

    proc.stderr.on("data", (data) => {
      details.stderr += data.toString();
    });

    proc.on("error", (error) => {
      details.stderr += details.stderr ? `\n${error.message}` : error.message;
      finish(1);
    });

    proc.on("close", (code) => {
      if (stdoutBuffer.trim()) processLine(stdoutBuffer);
      finish(code ?? 0);
    });

    if (params.signal) {
      if (params.signal.aborted) kill("Subagent aborted.");
      else params.signal.addEventListener("abort", () => kill("Subagent aborted."), { once: true });
    }
  });

  details.durationMs = Date.now() - startedAt;
  return details;
}

function formatUsage(details: SubagentDetails): string {
  const parts: string[] = [];
  if (details.usage.turns)
    parts.push(`${details.usage.turns} turn${details.usage.turns === 1 ? "" : "s"}`);
  if (details.usage.input) parts.push(`↑${details.usage.input}`);
  if (details.usage.output) parts.push(`↓${details.usage.output}`);
  if (details.usage.cacheRead) parts.push(`R${details.usage.cacheRead}`);
  if (details.usage.cacheWrite) parts.push(`W${details.usage.cacheWrite}`);
  if (details.usage.cost) parts.push(`$${details.usage.cost.toFixed(3)}`);
  return parts.join(" ");
}

function maybeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function xtermColorToHex(index: number): string {
  if (index < 16) {
    const ansi = [
      "#000000",
      "#800000",
      "#008000",
      "#808000",
      "#000080",
      "#800080",
      "#008080",
      "#c0c0c0",
      "#808080",
      "#ff0000",
      "#00ff00",
      "#ffff00",
      "#0000ff",
      "#ff00ff",
      "#00ffff",
      "#ffffff",
    ];
    return ansi[index] ?? "#ffffff";
  }
  if (index >= 232) {
    const level = 8 + (index - 232) * 10;
    const hex = level.toString(16).padStart(2, "0");
    return `#${hex}${hex}${hex}`;
  }

  const color = index - 16;
  const r = Math.floor(color / 36);
  const g = Math.floor((color % 36) / 6);
  const b = color % 6;
  const channel = (value: number) => (value === 0 ? 0 : 55 + value * 40);
  return `#${channel(r).toString(16).padStart(2, "0")}${channel(g)
    .toString(16)
    .padStart(2, "0")}${channel(b).toString(16).padStart(2, "0")}`;
}

function ansiForegroundToHex(styled: string, fallback: string): string {
  const escape = "\\u001b";
  const trueColor = new RegExp(`${escape}\\[38;2;(\\d+);(\\d+);(\\d+)m`).exec(styled);
  if (trueColor) {
    const [, r, g, b] = trueColor;
    return `#${Number(r).toString(16).padStart(2, "0")}${Number(g)
      .toString(16)
      .padStart(2, "0")}${Number(b).toString(16).padStart(2, "0")}`;
  }

  const xterm = new RegExp(`${escape}\\[38;5;(\\d+)m`).exec(styled);
  if (xterm) return xtermColorToHex(Number(xterm[1]));

  return fallback;
}

function isWezTerm(): boolean {
  return Boolean(process.env.WEZTERM_PANE || process.env.TERM_PROGRAM?.toLowerCase() === "wezterm");
}

function padCell(text: string, width: number): string {
  const truncated = truncateToWidth(text, Math.max(0, width), "");
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function borderLine(
  left: string,
  fill: string,
  right: string,
  width: number,
  title?: string,
): string {
  const label = title ? ` ${title} ` : "";
  const fillWidth = Math.max(
    0,
    width - visibleWidth(left) - visibleWidth(right) - visibleWidth(label),
  );
  return left + label + fill.repeat(fillWidth) + right;
}

class PokemonSubagentCard implements Component {
  private cachedLines?: string[];
  private cachedWidth?: number;

  constructor(
    private readonly params: {
      title: string;
      pokemon: PokemonName;
      colorHex: string;
      fallbackArtLines: string[];
      rightLines: string[];
      outputLines: string[];
      imageColumns: number;
      imageRows: number;
    },
  ) {}

  invalidate(): void {
    this.cachedLines = undefined;
    this.cachedWidth = undefined;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const cardWidth = Math.max(36, Math.min(width, 104));
    const innerWidth = Math.max(1, cardWidth - 4);
    const imageColumns = Math.min(this.params.imageColumns, innerWidth);
    const imageRows = this.params.imageRows;
    const lines: string[] = [];

    lines.push(borderLine("╭", "─", "╮", cardWidth, this.params.title));
    lines.push(`│ ${padCell(this.params.pokemon, innerWidth)} │`);
    lines.push(`├${"─".repeat(cardWidth - 2)}┤`);

    const imageLines = this.imageLines(imageColumns, imageRows);
    if (imageLines) {
      lines.push(...imageLines);
      lines.push(`├${"─".repeat(cardWidth - 2)}┤`);
    } else {
      for (let row = 0; row < imageRows; row += 1) {
        lines.push(`│ ${padCell(this.params.fallbackArtLines[row] ?? "", innerWidth)} │`);
      }
      lines.push(`├${"─".repeat(cardWidth - 2)}┤`);
    }

    for (const infoLine of this.params.rightLines) {
      lines.push(`│ ${padCell(infoLine, innerWidth)} │`);
    }

    if (this.params.outputLines.length > 0) {
      lines.push(`├${"─".repeat(cardWidth - 2)}┤`);
      for (const outputLine of this.params.outputLines) {
        lines.push(`│ ${padCell(outputLine, innerWidth)} │`);
      }
    }

    lines.push(`╰${"─".repeat(cardWidth - 2)}╯`);
    this.cachedLines = lines;
    this.cachedWidth = width;
    return lines;
  }

  private imageLines(columns: number, rows: number): string[] | undefined {
    if (!getCapabilities().images || !isWezTerm()) return undefined;

    const png = renderPokemonPng(this.params.pokemon, { foreground: this.params.colorHex });
    const cellDimensions = getCellDimensions();
    const widthScale = (columns * cellDimensions.widthPx) / Math.max(1, png.widthPx);
    const heightScale = (rows * cellDimensions.heightPx) / Math.max(1, png.heightPx);
    const scale = Math.min(widthScale, heightScale);
    const displayColumns = Math.max(
      1,
      Math.min(columns, Math.ceil((png.widthPx * scale) / cellDimensions.widthPx)),
    );
    const displayRows = Math.max(
      1,
      Math.min(rows, Math.ceil((png.heightPx * scale) / cellDimensions.heightPx)),
    );
    const sequence = encodeITerm2(png.base64, {
      width: displayColumns,
      height: displayRows,
      preserveAspectRatio: true,
    });

    const imageLines: string[] = [];
    for (let row = 0; row < displayRows - 1; row += 1) imageLines.push("");
    const moveUp = displayRows > 1 ? `\x1b[${displayRows - 1}A` : "";
    imageLines.push(moveUp + sequence);
    return imageLines;
  }
}

const POKEMON_PREVIEW_NAMES: PokemonName[] = [
  "Pikachu",
  "Mew",
  "Gengar",
  "Snorlax",
  "Charizard",
  "Jigglypuff",
  "Eevee",
  "Mewtwo",
];

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
          const lines: string[] = [];
          for (const pokemon of POKEMON_PREVIEW_NAMES) {
            const card = new PokemonSubagentCard({
              title: `${pokemon} preview`,
              pokemon,
              colorHex: ansiForegroundToHex(theme.fg("accent", "x"), "#facc15"),
              fallbackArtLines: renderPokemonArt(pokemon, { maxColumns: 24, maxRows: 8 }).map(
                (line) => theme.fg("accent", line),
              ),
              rightLines: [
                `${theme.fg("muted", "status: ")}${theme.fg("success", "preview")}`,
                `${theme.fg("muted", "model: ")}${theme.fg("dim", "default")}`,
                `${theme.fg("muted", "role: ")}${theme.fg("dim", "research scout")}`,
                `${theme.fg("muted", "cwd: ")}${theme.fg("dim", ctx.cwd)}`,
                "",
                `${theme.fg("muted", "task: ")}${theme.fg("dim", "Preview card layout and image placement")}`,
              ],
              outputLines: [theme.fg("toolOutput", "Preview output stays inside the card.")],
              imageColumns: 24,
              imageRows: 8,
            });
            lines.push(...card.render(width), "");
          }
          lines.push(theme.fg("dim", "Esc to close"));
          return lines;
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
      const task = maybeString(args.task) ?? "...";
      const role = maybeString(args.role);
      const model = maybeString(args.model);
      const cwd = maybeString(args.cwd);
      const pokemon = choosePokemonForSubagent({ task, role, model, cwd });
      const preview = task.length > 80 ? `${task.slice(0, 80)}...` : task;
      let text = `${theme.fg("toolTitle", theme.bold(pokemon))} ${theme.fg("muted", "subagent")}`;
      text += ` ${theme.fg("warning", "starting")}`;
      text += `\n${theme.fg("muted", "model: ")}${theme.fg("dim", model ?? "default")}`;
      if (role) text += ` ${theme.fg("muted", "role: ")}${theme.fg("dim", role)}`;
      if (cwd) text += ` ${theme.fg("muted", "cwd: ")}${theme.fg("dim", cwd)}`;
      text += `\n${theme.fg("dim", preview)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details as SubagentDetails | undefined;
      if (!details) return new Text("(no subagent details)", 0, 0);

      const pokemon =
        details.pokemon ??
        choosePokemonForSubagent({
          task: details.task,
          role: details.role,
          model: details.model,
          cwd: details.cwd,
        });
      const colorToken = isPartial ? "warning" : "accent";
      const imageColumns = expanded ? 36 : 24;
      const imageRows = expanded ? 14 : 8;
      const fallbackArtLines = (
        expanded
          ? getPokemonArt(pokemon).split("\n")
          : renderPokemonArt(pokemon, { maxColumns: 24, maxRows: 8 })
      ).map((line) => theme.fg(colorToken, line));

      if (isPartial) {
        let text = `${theme.fg("warning", "⏳")} ${theme.fg("toolTitle", theme.bold(pokemon))} ${theme.fg(
          "muted",
          "subagent running",
        )}`;
        if (details.model) text += theme.fg("muted", ` ${details.model}`);
        text += `\n${theme.fg("muted", "task: ")}${theme.fg("dim", details.task)}`;
        return new Text(text, 0, 0);
      }

      const ok = details.exitCode === 0;
      const icon = ok ? theme.fg("success", "✓") : theme.fg("error", "✗");
      const duration = `${(details.durationMs / 1000).toFixed(1)}s`;
      const usage = formatUsage(details);
      const outputLines: string[] = [];
      if (details.stderr.trim()) {
        outputLines.push(theme.fg("error", "stderr:"));
        outputLines.push(
          ...details.stderr
            .trim()
            .split("\n")
            .slice(0, expanded ? 20 : 4)
            .map((line) => theme.fg("error", line)),
        );
      }
      if (details.finalOutput.trim()) {
        outputLines.push(theme.fg("muted", "output:"));
        outputLines.push(
          ...details.finalOutput
            .trim()
            .split("\n")
            .slice(0, expanded ? 40 : 6)
            .map((line) => theme.fg("toolOutput", line)),
        );
        if (!expanded && details.finalOutput.trim().split("\n").length > 6)
          outputLines.push(theme.fg("muted", "(Ctrl+O to expand)"));
      }

      return new PokemonSubagentCard({
        title: `${icon} ${pokemon} subagent`,
        pokemon,
        colorHex: ansiForegroundToHex(theme.fg("accent", "x"), "#facc15"),
        fallbackArtLines,
        rightLines: [
          `${theme.fg("muted", "status: ")}${ok ? theme.fg("success", "done") : theme.fg("error", "failed")}`,
          `${theme.fg("muted", "duration: ")}${theme.fg("dim", duration)}`,
          details.model ? `${theme.fg("muted", "model: ")}${theme.fg("dim", details.model)}` : "",
          usage ? `${theme.fg("muted", "usage: ")}${theme.fg("dim", usage)}` : "",
          details.role ? `${theme.fg("muted", "role: ")}${theme.fg("dim", details.role)}` : "",
          `${theme.fg("muted", "cwd: ")}${theme.fg("dim", details.cwd)}`,
          details.truncated && details.fullOutputPath
            ? `${theme.fg("warning", "truncated: ")}${theme.fg("dim", details.fullOutputPath)}`
            : "",
          "",
          `${theme.fg("muted", "task: ")}${theme.fg("dim", details.task)}`,
        ].filter(Boolean),
        outputLines,
        imageColumns,
        imageRows,
      });
    },
  });
}
