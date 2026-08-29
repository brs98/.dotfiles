import { open, readdir, stat } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";

type LineListener = (line: string) => void;
type AttachListener = (replayed: boolean) => void;

const POLL_INTERVAL_MS = 350;
const READ_CHUNK_BYTES = 1024 * 1024;
const MAX_REPLAY_BYTES = 128 * 1024 * 1024;

export class PowerLogTailer {
  private readonly logRoot: string;
  private readonly onLine: LineListener;
  private readonly onAttach: AttachListener;
  private currentPath: string | undefined;
  private position = 0;
  private remainder = "";
  private decoder = new StringDecoder("utf8");
  private stopped = false;

  constructor(logRoot: string, onLine: LineListener, onAttach: AttachListener) {
    this.logRoot = logRoot;
    this.onLine = onLine;
    this.onAttach = onAttach;
  }

  stop(): void {
    this.stopped = true;
  }

  async run(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.poll();
      } catch (error: unknown) {
        console.error("hearthstone-matchup: log polling failed", error);
      }
      await delay(POLL_INTERVAL_MS);
    }
  }

  private async poll(): Promise<void> {
    const newest = await newestPowerLog(this.logRoot);
    if (!newest) return;
    if (newest !== this.currentPath) await this.attach(newest);

    const fileStats = await stat(newest);
    if (fileStats.size < this.position) await this.attach(newest);
    if (fileStats.size === this.position) return;

    const handle = await open(newest, "r");
    try {
      await this.readAvailable(handle, fileStats.size);
    } finally {
      await handle.close();
    }
  }

  private async attach(path: string): Promise<void> {
    const fileStats = await stat(path);
    const replayed = fileStats.size <= MAX_REPLAY_BYTES;
    this.currentPath = path;
    this.position = replayed ? 0 : fileStats.size;
    this.remainder = "";
    this.decoder = new StringDecoder("utf8");
    this.onAttach(replayed);
  }

  private async readAvailable(handle: FileHandle, end: number): Promise<void> {
    while (this.position < end) {
      const bytesToRead = Math.min(READ_CHUNK_BYTES, end - this.position);
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const { bytesRead } = await handle.read(buffer, 0, bytesToRead, this.position);
      if (bytesRead === 0) return;
      this.position += bytesRead;
      this.consume(this.decoder.write(buffer.subarray(0, bytesRead)));
    }
  }

  private consume(chunk: string): void {
    const lines = `${this.remainder}${chunk}`.split(/\r?\n/);
    this.remainder = lines.pop() ?? "";
    for (const line of lines) this.onLine(line);
  }
}

async function newestPowerLog(root: string): Promise<string | undefined> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error: unknown) {
    if (isNotFound(error)) return undefined;
    throw error;
  }

  let newest: { readonly path: string; readonly modified: number } | undefined;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("Hearthstone_")) continue;
    const path = join(root, entry.name, "Power.log");
    try {
      const fileStats = await stat(path);
      if (!newest || fileStats.mtimeMs > newest.modified) {
        newest = { path, modified: fileStats.mtimeMs };
      }
    } catch (error: unknown) {
      if (!isNotFound(error)) throw error;
    }
  }
  return newest?.path;
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
