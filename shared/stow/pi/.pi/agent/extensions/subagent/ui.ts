import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  encodeITerm2,
  getCapabilities,
  getCellDimensions,
  Text,
  truncateToWidth,
  visibleWidth,
  type Component,
} from "@earendil-works/pi-tui";
import {
  choosePokemonForSubagent,
  getPokemonArt,
  renderPokemonArt,
  renderPokemonPng,
  type PokemonName,
} from "./assets/pokemon-art.js";
import type { SubagentDetails } from "./runner.js";

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
  if (width <= 0) return "";
  if (width <= visibleWidth(left)) return truncateToWidth(left, width, "");

  const sideWidth = visibleWidth(left) + visibleWidth(right);
  const maxLabelWidth = Math.max(0, width - sideWidth);
  const label = title ? truncateToWidth(` ${title} `, maxLabelWidth, "") : "";
  const fillWidth = Math.max(0, width - sideWidth - visibleWidth(label));
  return truncateToWidth(left + label + fill.repeat(fillWidth) + right, width, "");
}

function horizontalLine(left: string, fill: string, right: string, width: number): string {
  if (width <= 0) return "";
  if (width <= visibleWidth(left)) return truncateToWidth(left, width, "");

  const fillWidth = Math.max(0, width - visibleWidth(left) - visibleWidth(right));
  return truncateToWidth(left + fill.repeat(fillWidth) + right, width, "");
}

function contentLine(text: string, innerWidth: number, outerWidth: number): string {
  if (outerWidth <= 0) return "";
  if (outerWidth < 4) return truncateToWidth(`│ ${text} │`, outerWidth, "");
  return `│ ${padCell(text, innerWidth)} │`;
}

class NarrowSafeText implements Component {
  private readonly text: Text;

  constructor(text: string) {
    this.text = new Text(text, 0, 0);
  }

  invalidate(): void {
    this.text.invalidate();
  }

  render(width: number): string[] {
    if (width < 4) return [""];
    return this.text.render(width).map((line) => truncateToWidth(line, width, ""));
  }
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
    if (width < 4) return [""];
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const cardWidth = Math.max(0, Math.min(width, 104));
    const innerWidth = Math.max(0, cardWidth - 4);
    const imageRows = this.params.imageRows;
    const lines: string[] = [];

    lines.push(borderLine("╭", "─", "╮", cardWidth, this.params.title));
    lines.push(contentLine(this.params.pokemon, innerWidth, cardWidth));
    lines.push(horizontalLine("├", "─", "┤", cardWidth));

    const imageColumns = Math.min(this.params.imageColumns, innerWidth);
    const imageLines = imageColumns >= 12 ? this.imageLines(imageColumns, imageRows) : undefined;
    if (imageLines) {
      lines.push(...imageLines);
      lines.push(horizontalLine("├", "─", "┤", cardWidth));
    } else if (!getCapabilities().images) {
      for (let row = 0; row < imageRows; row += 1) {
        lines.push(contentLine(this.params.fallbackArtLines[row] ?? "", innerWidth, cardWidth));
      }
      lines.push(horizontalLine("├", "─", "┤", cardWidth));
    }

    for (const infoLine of this.params.rightLines) {
      lines.push(contentLine(infoLine, innerWidth, cardWidth));
    }

    if (this.params.outputLines.length > 0) {
      lines.push(horizontalLine("├", "─", "┤", cardWidth));
      for (const outputLine of this.params.outputLines) {
        lines.push(contentLine(outputLine, innerWidth, cardWidth));
      }
    }

    lines.push(horizontalLine("╰", "─", "╯", cardWidth));
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

export function renderPokemonPreviewLines(theme: Theme, cwd: string, width: number): string[] {
  const lines: string[] = [];
  for (const pokemon of POKEMON_PREVIEW_NAMES) {
    const card = new PokemonSubagentCard({
      title: `${pokemon} preview`,
      pokemon,
      colorHex: ansiForegroundToHex(theme.fg("accent", "x"), "#facc15"),
      fallbackArtLines: renderPokemonArt(pokemon, { maxColumns: 24, maxRows: 8 }).map((line) =>
        theme.fg("accent", line),
      ),
      rightLines: [
        `${theme.fg("muted", "status: ")}${theme.fg("success", "preview")}`,
        `${theme.fg("muted", "model: ")}${theme.fg("dim", "default")}`,
        `${theme.fg("muted", "role: ")}${theme.fg("dim", "research scout")}`,
        `${theme.fg("muted", "cwd: ")}${theme.fg("dim", cwd)}`,
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
}

export function renderSubagentCall(args: Record<string, unknown>, theme: Theme): Component {
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
  return new NarrowSafeText(text);
}

export function renderSubagentResult(
  details: SubagentDetails | undefined,
  { expanded, isPartial }: { expanded: boolean; isPartial: boolean },
  theme: Theme,
): Component {
  if (!details) return new NarrowSafeText("(no subagent details)");

  const pokemon =
    details.pokemon ??
    choosePokemonForSubagent({
      task: details.task,
      role: details.role,
      model: details.model,
      cwd: details.cwd,
    });
  const colorToken = isPartial ? "warning" : "accent";
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
    return new NarrowSafeText(text);
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
    imageColumns: expanded ? 36 : 24,
    imageRows,
  });
}
