jest.mock(
  "@earendil-works/pi-ai",
  () => ({
    StringEnum: (values: readonly string[]) => ({ values }),
  }),
  { virtual: true },
);

jest.mock(
  "typebox",
  () => ({
    Type: {
      Boolean: (schema?: unknown) => schema ?? {},
      Number: (schema?: unknown) => schema ?? {},
      Object: (schema: unknown) => schema,
      Optional: (schema: unknown) => schema,
      String: (schema?: unknown) => schema ?? {},
    },
  }),
  { virtual: true },
);

jest.mock(
  "@earendil-works/pi-coding-agent",
  () => ({
    getAgentDir: () => "/tmp/pi-agent",
    parseFrontmatter: (content: string) => ({ frontmatter: {}, body: content }),
    withFileMutationQueue: async (_path: string, fn: () => Promise<void>) => fn(),
  }),
  { virtual: true },
);

jest.mock(
  "@earendil-works/pi-tui",
  () => ({
    Key: {
      down: "down",
      end: "end",
      enter: "enter",
      escape: "escape",
      home: "home",
      pageDown: "pageDown",
      pageUp: "pageUp",
      up: "up",
      ctrl: (key: string) => `ctrl+${key}`,
    },
    matchesKey: (data: string, key: string) => data === key,
    Text: class Text {
      constructor(
        public readonly text: string,
        public readonly paddingX?: number,
        public readonly paddingY?: number,
      ) {}
    },
    truncateToWidth: (text: string, width: number) => stripAnsi(text).slice(0, width),
    visibleWidth: (text: string) => stripAnsi(text).length,
    wrapTextWithAnsi: (text: string, width: number) => wrapText(text, width),
  }),
  { virtual: true },
);

let ScrollableConfirmDialog: typeof import("./ui.js").ScrollableConfirmDialog;

beforeAll(async () => {
  ({ ScrollableConfirmDialog } = await import("./ui.js"));
});

const styles = {
  accent: (text: string) => text,
  dim: (text: string) => text,
  bold: (text: string) => text,
};

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

function visibleWidth(text: string): number {
  return stripAnsi(text).length;
}

function wrapText(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const lines: string[] = [];
  for (let index = 0; index < text.length; index += width) {
    lines.push(text.slice(index, index + width));
  }
  return lines;
}

describe("agent-team scrollable confirmation dialog", () => {
  it("scrolls long checkpoint bodies while preserving approve/cancel shortcuts", () => {
    const done = jest.fn();
    const requestRender = jest.fn();
    const dialog = new ScrollableConfirmDialog(
      "Approve build",
      "line one\nline two\nline three\nline four",
      done,
      requestRender,
      styles,
      2,
    );

    let rendered = dialog.render(72).join("\n");
    expect(rendered).toContain("line one");
    expect(rendered).toContain("line two");
    expect(rendered).not.toContain("line three");

    dialog.handleInput("j");
    expect(requestRender).toHaveBeenCalledTimes(1);

    rendered = dialog.render(72).join("\n");
    expect(rendered).not.toContain("line one");
    expect(rendered).toContain("line two");
    expect(rendered).toContain("line three");

    dialog.handleInput("y");
    expect(done).toHaveBeenLastCalledWith(true);

    dialog.handleInput("n");
    expect(done).toHaveBeenLastCalledWith(false);
  });

  it("keeps every rendered line within the requested width", () => {
    const dialog = new ScrollableConfirmDialog(
      "A very long title that must not overflow the overlay width",
      "A very long checkpoint sentence that should wrap or truncate instead of overflowing the terminal component width.",
      jest.fn(),
      jest.fn(),
      styles,
      3,
    );

    for (const line of dialog.render(48)) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(48);
    }
  });
});
