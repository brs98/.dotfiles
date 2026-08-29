import assert from "node:assert/strict";
import {
  appendFile,
  mkdtemp,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  truncate,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PowerLogTailer, replayStartPosition } from "./log-tailer.js";

const CREATE_GAME = "GameState.DebugPrintPower() - CREATE_GAME";
const READ_CHUNK_BYTES = 1024 * 1024;
const MAX_REPLAY_BYTES = 128 * 1024 * 1024;

test("fails over from a stalled Power.log and stays on Player.log for that session", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "hearthstone-log-failover-"));

  const logRoot = join(fixtureRoot, "Logs");
  const sessionRoot = join(logRoot, "Hearthstone_2026_08_29_00_00_00");
  const powerLog = join(sessionRoot, "Power.log");
  const playerLog = join(fixtureRoot, "Player.log");
  await mkdir(sessionRoot, { recursive: true });
  await writeFile(powerLog, "power-one\n");
  await writeFile(playerLog, `[Power] ${CREATE_GAME}\nplayer-old\n`);
  const sameTime = new Date(10_000);
  await utimes(powerLog, sameTime, sameTime);
  await utimes(playerLog, sameTime, sameTime);

  const lines: string[] = [];
  let attachments = 0;
  const tailer = new PowerLogTailer(
    logRoot,
    playerLog,
    (line) => lines.push(line),
    () => {
      attachments += 1;
    },
    { pollIntervalMs: 5, staleAfterMs: 25 },
  );
  const running = tailer.run();
  context.after(async () => {
    tailer.stop();
    await running;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  await waitFor(() => lines.includes("power-one"));
  await delay(10);
  await appendFile(playerLog, "player-live-one\n");
  await waitFor(() => lines.includes("player-live-one"));
  assert.equal(attachments, 2);

  await appendFile(powerLog, "power-resumed\n");
  await appendFile(playerLog, "player-live-two\n");
  await waitFor(() => lines.includes("player-live-two"));
  await delay(35);

  assert.equal(attachments, 2);
  assert.equal(lines.includes("power-resumed"), false);
});

test("reattaches when Player.log is replaced at the same path", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "hearthstone-log-rotation-"));

  const logRoot = join(fixtureRoot, "Logs");
  const playerLog = join(fixtureRoot, "Player.log");
  await mkdir(logRoot);
  await writeFile(playerLog, `${CREATE_GAME}\nold-session\n`);

  const lines: string[] = [];
  let attachments = 0;
  const tailer = new PowerLogTailer(
    logRoot,
    playerLog,
    (line) => lines.push(line),
    () => {
      attachments += 1;
    },
    { pollIntervalMs: 5, staleAfterMs: 25 },
  );
  const running = tailer.run();
  context.after(async () => {
    tailer.stop();
    await running;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  await waitFor(() => lines.includes("old-session"));
  await rename(playerLog, join(fixtureRoot, "Player.old.log"));
  await writeFile(playerLog, `${CREATE_GAME}\nnew-session-with-more-content\n`);
  await waitFor(() => lines.includes("new-session-with-more-content"));

  assert.equal(attachments, 2);
});

test("detects rapid copy-truncate regrowth without an inode change", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "hearthstone-log-truncate-"));

  const logRoot = join(fixtureRoot, "Logs");
  const playerLog = join(fixtureRoot, "Player.log");
  await mkdir(logRoot);
  await writeFile(playerLog, `${CREATE_GAME}\nold\n`);
  const originalInode = (await stat(playerLog)).ino;

  const lines: string[] = [];
  let attachments = 0;
  const tailer = new PowerLogTailer(
    logRoot,
    playerLog,
    (line) => lines.push(line),
    () => {
      attachments += 1;
    },
    { pollIntervalMs: 5, staleAfterMs: 25 },
  );
  const running = tailer.run();
  context.after(async () => {
    tailer.stop();
    await running;
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  await waitFor(() => lines.includes("old"));
  await writeFile(playerLog, `${CREATE_GAME}\nreplacement-is-longer-than-the-original\n`);
  assert.equal((await stat(playerLog)).ino, originalInode);
  await waitFor(() => lines.includes("replacement-is-longer-than-the-original"));

  assert.equal(attachments, 2);
});

test("replays Player.log from the latest game instead of its entire history", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "hearthstone-log-replay-"));
  context.after(async () => rm(fixtureRoot, { recursive: true, force: true }));

  const playerLog = join(fixtureRoot, "Player.log");
  const oldGame = `[Power] ${CREATE_GAME}\nold game\n`;
  const currentGame = `[Power] ${CREATE_GAME}\ncurrent game\n`;
  await writeFile(playerLog, `${oldGame}${currentGame}`);

  const position = await replayStartPosition(playerLog, "player");
  const contents = await readFile(playerLog, "utf8");

  assert.equal(position, contents.lastIndexOf(CREATE_GAME));
  assert.equal(contents.slice(position), `${CREATE_GAME}\ncurrent game\n`);
});

test("finds a CREATE_GAME marker split across backward-read chunks", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "hearthstone-log-boundary-"));
  context.after(async () => rm(fixtureRoot, { recursive: true, force: true }));

  const playerLog = join(fixtureRoot, "Player.log");
  const prefix = "before-marker";
  const after = "x".repeat(READ_CHUNK_BYTES - 10);
  await writeFile(playerLog, `${prefix}${CREATE_GAME}${after}`);

  assert.equal(await replayStartPosition(playerLog, "player"), prefix.length);
});

test("does not replay Player.log when no recent CREATE_GAME marker exists", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "hearthstone-log-no-game-"));
  context.after(async () => rm(fixtureRoot, { recursive: true, force: true }));

  const playerLog = join(fixtureRoot, "Player.log");
  await writeFile(playerLog, "no game marker here\n");

  assert.equal(await replayStartPosition(playerLog, "player"), (await stat(playerLog)).size);
});

test("includes a CREATE_GAME marker at the 128 MiB replay boundary", async (context) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "hearthstone-log-window-"));
  context.after(async () => rm(fixtureRoot, { recursive: true, force: true }));

  const playerLog = join(fixtureRoot, "Player.log");
  const markerPosition = 1024;
  await writeFile(playerLog, "");
  await truncate(playerLog, MAX_REPLAY_BYTES + markerPosition);
  const handle = await open(playerLog, "r+");
  try {
    await handle.write(CREATE_GAME, markerPosition, "utf8");
  } finally {
    await handle.close();
  }

  assert.equal(await replayStartPosition(playerLog, "player"), markerPosition);
});

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for tailer event");
    await delay(5);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
