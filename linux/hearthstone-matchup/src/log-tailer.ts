import { open, readdir, stat } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { StringDecoder } from "node:string_decoder";

type LineListener = (line: string, replayed: boolean) => void;
type AttachListener = (replayed: boolean) => void;
type LogSourceKind = "player" | "power";

interface PowerStream {
  readonly kind: LogSourceKind;
  readonly path: string;
  readonly size: number;
  readonly modified: number;
  readonly identity: string;
}

interface PowerStreams {
  readonly player?: PowerStream;
  readonly power?: PowerStream;
}

interface TailerOptions {
  readonly pollIntervalMs?: number;
  readonly staleAfterMs?: number;
  readonly onReplayComplete?: () => void;
}

const POLL_INTERVAL_MS = 350;
const READ_CHUNK_BYTES = 1024 * 1024;
const MAX_FULL_POWER_REPLAY_BYTES = 128 * 1024 * 1024;
const POWER_STALE_AFTER_MS = 3_000;
const ANCHOR_BYTES = 128;
const CREATE_GAME_MARKER = Buffer.from("GameState.DebugPrintPower() - CREATE_GAME");

export class PowerLogTailer {
  private readonly logRoot: string;
  private readonly playerLogPath: string;
  private readonly onLine: LineListener;
  private readonly onAttach: AttachListener;
  private readonly pollIntervalMs: number;
  private readonly staleAfterMs: number;
  private readonly onReplayComplete: () => void;
  private currentSource: PowerStream | undefined;
  private fallbackPowerPath: string | undefined;
  private lastPowerSize: number | undefined;
  private lastPlayerSize: number | undefined;
  private playerAdvancedSincePowerGrowth = false;
  private powerIdleSince = performance.now();
  private position = 0;
  private anchor = Buffer.alloc(0);
  private anchorPosition = 0;
  private remainder = "";
  private decoder = new StringDecoder("utf8");
  private replaying = false;
  private stopped = false;

  constructor(
    logRoot: string,
    playerLogPath: string,
    onLine: LineListener,
    onAttach: AttachListener,
    options: TailerOptions = {},
  ) {
    this.logRoot = logRoot;
    this.playerLogPath = playerLogPath;
    this.onLine = onLine;
    this.onAttach = onAttach;
    this.pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
    this.staleAfterMs = options.staleAfterMs ?? POWER_STALE_AFTER_MS;
    this.onReplayComplete = options.onReplayComplete ?? (() => undefined);
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
      await delay(this.pollIntervalMs);
    }
  }

  private async poll(): Promise<void> {
    const streams = await discoverPowerStreams(this.logRoot, this.playerLogPath);
    let selected = this.selectSource(streams, performance.now());
    if (!selected) return;

    const current = this.currentSource;
    const sourceChanged =
      !current || selected.path !== current.path || selected.identity !== current.identity;
    const sourceRewritten =
      !sourceChanged &&
      (selected.size < this.position ||
        (selected.modified !== current.modified && (await this.anchorChanged(selected))));
    if (sourceChanged || sourceRewritten) {
      selected = await this.attach(selected);
    } else {
      this.currentSource = selected;
    }

    if (selected.size === this.position) {
      this.finishReplay();
      return;
    }
    const handle = await open(selected.path, "r");
    try {
      await this.readAvailable(handle, selected.size);
      await this.rememberAnchor(handle);
      this.finishReplay();
    } finally {
      await handle.close();
    }
  }

  private selectSource(streams: PowerStreams, now: number): PowerStream | undefined {
    const powerGrew = streams.power !== undefined && streams.power.size !== this.lastPowerSize;
    const playerGrew = streams.player !== undefined && streams.player.size !== this.lastPlayerSize;

    if (powerGrew) {
      this.powerIdleSince = now;
      this.playerAdvancedSincePowerGrowth = false;
    } else if (playerGrew) {
      this.playerAdvancedSincePowerGrowth = true;
    }
    this.lastPowerSize = streams.power?.size;
    this.lastPlayerSize = streams.player?.size;

    if (!this.currentSource) {
      if (
        streams.player &&
        (!streams.power || streams.player.modified > streams.power.modified + this.staleAfterMs)
      ) {
        this.fallbackPowerPath = streams.power?.path;
        return streams.player;
      }
      return streams.power ?? streams.player;
    }

    if (this.currentSource.kind === "player") {
      if (
        streams.power &&
        streams.power.path !== this.fallbackPowerPath &&
        streams.power.modified >= (streams.player?.modified ?? 0)
      ) {
        this.fallbackPowerPath = undefined;
        this.powerIdleSince = now;
        return streams.power;
      }
      return streams.player ?? streams.power;
    }

    if (streams.power?.path !== this.currentSource.path) {
      this.fallbackPowerPath = undefined;
      this.powerIdleSince = now;
      return streams.power ?? streams.player;
    }

    if (
      streams.player &&
      this.playerAdvancedSincePowerGrowth &&
      !powerGrew &&
      now - this.powerIdleSince >= this.staleAfterMs
    ) {
      this.fallbackPowerPath = streams.power.path;
      return streams.player;
    }
    return streams.power ?? streams.player;
  }

  private async attach(source: PowerStream): Promise<PowerStream> {
    const refreshed = await streamAtPath(source.path, source.kind);
    if (!refreshed) throw new Error(`Log disappeared while attaching: ${source.path}`);
    const position = await replayStartPosition(refreshed.path, refreshed.kind);
    const replayed = refreshed.size === 0 || position < refreshed.size;
    this.currentSource = refreshed;
    this.position = position;
    this.replaying = replayed;
    this.remainder = "";
    this.decoder = new StringDecoder("utf8");
    await this.rememberAnchorFromPath(refreshed.path);
    this.onAttach(replayed);
    return refreshed;
  }

  private async anchorChanged(source: PowerStream): Promise<boolean> {
    if (this.anchor.length === 0) return false;
    if (source.size < this.anchorPosition + this.anchor.length) return true;
    const handle = await open(source.path, "r");
    try {
      const actual = Buffer.allocUnsafe(this.anchor.length);
      const bytesRead = await readFully(handle, actual, this.anchorPosition);
      return bytesRead !== actual.length || !actual.equals(this.anchor);
    } finally {
      await handle.close();
    }
  }

  private async rememberAnchorFromPath(path: string): Promise<void> {
    const handle = await open(path, "r");
    try {
      await this.rememberAnchor(handle);
    } finally {
      await handle.close();
    }
  }

  private async rememberAnchor(handle: FileHandle): Promise<void> {
    const length = Math.min(ANCHOR_BYTES, this.position);
    this.anchorPosition = this.position - length;
    this.anchor = Buffer.allocUnsafe(length);
    const bytesRead = await readFully(handle, this.anchor, this.anchorPosition);
    if (bytesRead !== length) this.anchor = this.anchor.subarray(0, bytesRead);
  }

  private async readAvailable(handle: FileHandle, end: number): Promise<void> {
    while (this.position < end) {
      const bytesToRead = Math.min(READ_CHUNK_BYTES, end - this.position);
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const bytesRead = await readFully(handle, buffer, this.position);
      if (bytesRead === 0) return;
      this.position += bytesRead;
      this.consume(this.decoder.write(buffer.subarray(0, bytesRead)));
    }
  }

  private consume(chunk: string): void {
    const lines = `${this.remainder}${chunk}`.split(/\r?\n/);
    this.remainder = lines.pop() ?? "";
    for (const line of lines) this.onLine(line, this.replaying);
  }

  private finishReplay(): void {
    if (!this.replaying) return;
    this.replaying = false;
    this.onReplayComplete();
  }
}

export async function replayStartPosition(
  path: string,
  kind: LogSourceKind,
): Promise<number> {
  const fileStats = await stat(path);
  const handle = await open(path, "r");
  try {
    const earliest = 0;
    let cursor = fileStats.size;
    let suffix = Buffer.alloc(0);
    while (cursor > earliest) {
      const start = Math.max(earliest, cursor - READ_CHUNK_BYTES);
      const buffer = Buffer.allocUnsafe(cursor - start);
      const bytesRead = await readFully(handle, buffer, start);
      if (bytesRead === 0) break;
      const contents = Buffer.concat([buffer.subarray(0, bytesRead), suffix]);
      const markerAt = contents.lastIndexOf(CREATE_GAME_MARKER);
      if (markerAt !== -1) return start + markerAt;
      suffix = buffer.subarray(0, Math.min(CREATE_GAME_MARKER.length - 1, bytesRead));
      cursor = start + bytesRead < cursor ? start + bytesRead : start;
    }
    return kind === "power" && fileStats.size <= MAX_FULL_POWER_REPLAY_BYTES
      ? 0
      : fileStats.size;
  } finally {
    await handle.close();
  }
}

async function discoverPowerStreams(
  root: string,
  playerLogPath: string,
): Promise<PowerStreams> {
  const [power, player] = await Promise.all([
    newestPowerLog(root),
    streamAtPath(playerLogPath, "player"),
  ]);
  return { ...(power ? { power } : {}), ...(player ? { player } : {}) };
}

async function newestPowerLog(root: string): Promise<PowerStream | undefined> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error: unknown) {
    if (isNotFound(error)) return undefined;
    throw error;
  }

  let newest: PowerStream | undefined;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("Hearthstone_")) continue;
    const candidate = await streamAtPath(join(root, entry.name, "Power.log"), "power");
    if (candidate && (!newest || candidate.modified > newest.modified)) newest = candidate;
  }
  return newest;
}

async function streamAtPath(
  path: string,
  kind: LogSourceKind,
): Promise<PowerStream | undefined> {
  try {
    const fileStats = await stat(path);
    return {
      kind,
      path,
      size: fileStats.size,
      modified: fileStats.mtimeMs,
      identity: `${fileStats.dev}:${fileStats.ino}`,
    };
  } catch (error: unknown) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

async function readFully(
  handle: FileHandle,
  buffer: Buffer,
  position: number,
): Promise<number> {
  let total = 0;
  while (total < buffer.length) {
    const { bytesRead } = await handle.read(
      buffer,
      total,
      buffer.length - total,
      position + total,
    );
    if (bytesRead === 0) break;
    total += bytesRead;
  }
  return total;
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
