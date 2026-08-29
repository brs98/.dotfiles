import { homedir } from "node:os";
import { join } from "node:path";
import type { PowerEvent } from "./domain.js";
import { PowerLogTailer } from "./log-tailer.js";
import { PowerParser } from "./power-parser.js";
import { SimulationClient } from "./simulation-client.js";
import { StateWriter } from "./state-writer.js";

const userHome = homedir();
const logRoot =
  process.env.HEARTHSTONE_LOG_ROOT ??
  join(
    userHome,
    "Games/battlenet/pfx/drive_c/Program Files (x86)/Hearthstone/Logs",
  );
const playerLogPath =
  process.env.HEARTHSTONE_PLAYER_LOG ??
  join(
    userHome,
    "Games/battlenet/pfx/drive_c/users/steamuser/AppData/LocalLow/Blizzard Entertainment/Hearthstone/Player.log",
  );
const statePath =
  process.env.HEARTHSTONE_MATCHUP_STATE ??
  join(userHome, ".local/state/hearthstone-matchup/state.json");

const stateWriter = new StateWriter(statePath);
const simulator = new SimulationClient();
let combatToken = 0;
let combatActive = false;

const parser = new PowerParser((event) => {
  void handleEvent(event);
});

const tailer = new PowerLogTailer(
  logRoot,
  playerLogPath,
  (line) => parser.feed(line),
  (replayed) => {
    parser.reset();
    combatToken += 1;
    combatActive = false;
    void stateWriter.write({
      version: 1,
      status: "waiting",
      message: replayed ? "Waiting for Battlegrounds combat" : "Restarted mid-game; waiting for the next game",
    });
  },
);

async function handleEvent(event: PowerEvent): Promise<void> {
  switch (event.type) {
    case "game-created":
      combatToken += 1;
      combatActive = false;
      await stateWriter.write({
        version: 1,
        status: "waiting",
        message: "Waiting for Battlegrounds combat",
      });
      return;
    case "combat-ended":
    case "game-over":
      combatToken += 1;
      combatActive = false;
      await stateWriter.write({
        version: 1,
        status: "waiting",
        message: "Waiting for Battlegrounds combat",
      });
      return;
    case "combat-started": {
      const token = ++combatToken;
      combatActive = true;
      await stateWriter.write({ version: 1, status: "simulating", turn: event.snapshot.turn });
      if (!combatActive || token !== combatToken) return;
      try {
        const odds = await simulator.simulate(event.snapshot);
        if (!combatActive || token !== combatToken) return;
        await stateWriter.write({
          version: 1,
          status: "ready",
          turn: event.snapshot.turn,
          win: odds.win,
          tie: odds.tie,
          loss: odds.loss,
          simulations: odds.simulations,
          partial: event.snapshot.partial,
        });
        console.log(
          `hearthstone-matchup: turn ${event.snapshot.turn}: ` +
            `${odds.win}% win, ${odds.tie}% tie, ${odds.loss}% loss ` +
            `(${odds.simulations} simulations)`,
        );
      } catch (error: unknown) {
        console.error("hearthstone-matchup: simulation failed", error);
        if (!combatActive || token !== combatToken) return;
        await stateWriter.write({
          version: 1,
          status: "error",
          message: "This combat could not be simulated",
        });
      }
    }
  }
}

async function start(): Promise<void> {
  await stateWriter.write({
    version: 1,
    status: "waiting",
    message: "Waiting for Hearthstone",
  });
  await tailer.run();
}

function stop(): void {
  tailer.stop();
  simulator.close();
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

start().catch((error: unknown) => {
  console.error("hearthstone-matchup: fatal error", error);
  process.exitCode = 1;
});
