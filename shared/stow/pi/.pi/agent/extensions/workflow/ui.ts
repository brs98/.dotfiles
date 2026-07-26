import type { Theme } from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { extractMeta, type WorkflowMeta } from "./host.js";

class ClampedText implements Component {
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

export function renderWorkflowCall(args: Record<string, unknown>, theme: Theme): Component {
  const script = typeof args.script === "string" ? args.script : undefined;
  const scriptPath = typeof args.scriptPath === "string" ? args.scriptPath : undefined;
  const resume = typeof args.resumeFromRunId === "string" ? args.resumeFromRunId : undefined;

  let meta: WorkflowMeta | undefined;
  if (script) {
    try {
      meta = extractMeta(script).meta;
    } catch {
      // Partial args while streaming, or an invalid script; fall back to generic labels.
    }
  }

  let text = `${theme.fg("toolTitle", theme.bold("workflow"))} ${theme.fg(
    "dim",
    meta?.name ?? scriptPath ?? (resume ? `resume ${resume}` : "(inline script)"),
  )}`;
  if (meta?.description) text += `\n${theme.fg("muted", meta.description)}`;

  const facts: string[] = [];
  if (meta?.phases?.length) {
    facts.push(`${meta.phases.length} phase${meta.phases.length === 1 ? "" : "s"}`);
  }
  if (script) facts.push(`${script.length} chars`);
  if (resume && meta) facts.push(`resume ${resume}`);
  if (facts.length) text += `\n${theme.fg("dim", facts.join(" · "))}`;

  return new ClampedText(text);
}
