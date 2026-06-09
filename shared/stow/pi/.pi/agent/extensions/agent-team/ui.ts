import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import {
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
  type Component,
} from "@earendil-works/pi-tui";

type ConfirmDialogStyles = {
  accent: (text: string) => string;
  dim: (text: string) => string;
  bold: (text: string) => string;
};

const DEFAULT_CONFIRM_BODY_LINES = 12;

export class ScrollableConfirmDialog implements Component {
  private scroll = 0;
  private maxScroll = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private readonly title: string,
    private readonly message: string,
    private readonly done: (confirmed: boolean) => void,
    private readonly requestRender: () => void = () => {},
    private readonly styles: ConfirmDialogStyles = plainConfirmDialogStyles(),
    private readonly visibleBodyLines = DEFAULT_CONFIRM_BODY_LINES,
  ) {}

  handleInput(data: string): void {
    if (matchesKey(data, Key.enter) || data === "y" || data === "Y") {
      this.done(true);
      return;
    }

    if (matchesKey(data, Key.escape) || data === "n" || data === "N" || data === "q") {
      this.done(false);
      return;
    }

    if (matchesKey(data, Key.up) || data === "k") {
      this.scrollBy(-1);
      return;
    }

    if (matchesKey(data, Key.down) || data === "j") {
      this.scrollBy(1);
      return;
    }

    if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.ctrl("b"))) {
      this.scrollBy(-this.visibleBodyLines);
      return;
    }

    if (matchesKey(data, Key.pageDown) || matchesKey(data, Key.ctrl("f")) || data === " ") {
      this.scrollBy(this.visibleBodyLines);
      return;
    }

    if (matchesKey(data, Key.home) || data === "g") {
      this.setScroll(0);
      return;
    }

    if (matchesKey(data, Key.end) || data === "G") this.setScroll(this.maxScroll);
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const innerWidth = Math.max(32, width - 4);
    const bodyWidth = Math.max(20, innerWidth - 2);
    const bodyLines = wrapMessage(this.message, bodyWidth);
    this.maxScroll = Math.max(0, bodyLines.length - this.visibleBodyLines);
    this.scroll = clamp(this.scroll, 0, this.maxScroll);

    const visibleBody = bodyLines.slice(this.scroll, this.scroll + this.visibleBodyLines);
    while (visibleBody.length < Math.min(this.visibleBodyLines, bodyLines.length || 1)) {
      visibleBody.push("");
    }

    const top = `╭${"─".repeat(innerWidth + 2)}╮`;
    const separator = `├${"─".repeat(innerWidth + 2)}┤`;
    const bottom = `╰${"─".repeat(innerWidth + 2)}╯`;
    const title = this.styles.accent(this.styles.bold(this.title));
    const scrollInfo =
      this.maxScroll > 0
        ? this.styles.dim(`scroll ${this.scroll + 1}/${this.maxScroll + 1}`)
        : this.styles.dim("no overflow");
    const help = this.styles.dim("↑↓/j/k scroll • PgUp/PgDn • y/enter approve • n/esc cancel");

    const lines = [
      top,
      framedLine(joinColumns(title, scrollInfo, innerWidth), innerWidth),
      separator,
      ...visibleBody.map((line) => framedLine(line, innerWidth)),
      separator,
      framedLine(help, innerWidth),
      bottom,
    ];

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private scrollBy(delta: number): void {
    this.setScroll(this.scroll + delta);
  }

  private setScroll(value: number): void {
    const next = clamp(value, 0, this.maxScroll);
    if (next === this.scroll) return;
    this.scroll = next;
    this.invalidate();
    this.requestRender();
  }
}

function plainConfirmDialogStyles(): ConfirmDialogStyles {
  return {
    accent: (text) => text,
    dim: (text) => text,
    bold: (text) => text,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapMessage(message: string, width: number): string[] {
  const lines = message.split("\n").flatMap((line) => {
    if (!line.trim()) return [""];
    const wrapped = wrapTextWithAnsi(line, width);
    return wrapped.length > 0 ? wrapped : [""];
  });
  return lines.length > 0 ? lines : [""];
}

function joinColumns(left: string, right: string, width: number): string {
  const leftWidth = visibleWidth(left);
  const rightWidth = visibleWidth(right);
  if (leftWidth + rightWidth + 1 > width) return truncateToWidth(left, width);
  return `${left}${" ".repeat(width - leftWidth - rightWidth)}${right}`;
}

function framedLine(content: string, width: number): string {
  const truncated = truncateToWidth(content, width);
  const padding = Math.max(0, width - visibleWidth(truncated));
  return `│ ${truncated}${" ".repeat(padding)} │`;
}

export async function confirmScrollable(
  ui: ExtensionUIContext,
  title: string,
  message: string,
): Promise<boolean> {
  return ui.custom<boolean>(
    (tui, theme, _keybindings, done) =>
      new ScrollableConfirmDialog(title, message, done, () => tui.requestRender(), {
        accent: (text) => theme.fg("accent", text),
        dim: (text) => theme.fg("dim", text),
        bold: (text) => theme.bold(text),
      }),
    {
      overlay: true,
      overlayOptions: {
        width: "85%",
        minWidth: 60,
        maxHeight: "85%",
        margin: 1,
      },
    },
  );
}
