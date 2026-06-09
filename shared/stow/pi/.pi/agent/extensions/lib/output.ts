import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  truncateTail,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";

export type TruncatedOutput =
  | { truncated: false; content: string; text: string }
  | { truncated: true; content: string; text: string; fullOutputPath: string };

export async function makeTempOutputPath(prefix: string, fileName: string): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), prefix));
  return join(tempDir, fileName);
}

export async function truncateToFile(
  output: string,
  options: {
    direction: "head" | "tail";
    label: string;
    outputPath: () => string | Promise<string>;
  },
): Promise<TruncatedOutput> {
  const truncate = options.direction === "head" ? truncateHead : truncateTail;
  const truncation = truncate(output, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });

  if (!truncation.truncated) {
    return { truncated: false, content: truncation.content, text: truncation.content };
  }

  const path = await options.outputPath();
  await withFileMutationQueue(path, async () => {
    await writeFile(path, output, "utf8");
  });

  const text = `${truncation.content}\n\n[${options.label} truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(
    truncation.outputBytes,
  )} of ${formatSize(truncation.totalBytes)}). Full output saved to: ${path}]`;
  return { truncated: true, content: truncation.content, text, fullOutputPath: path };
}
