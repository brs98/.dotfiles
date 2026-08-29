import { parentPort } from "node:worker_threads";
import type { CombatSnapshot } from "./domain.js";
import { simulate } from "./simulator.js";

interface SimulationRequest {
  readonly id: number;
  readonly snapshot: CombatSnapshot;
}

if (!parentPort) throw new Error("The simulator worker requires a parent port.");
const workerPort = parentPort;

workerPort.on("message", (message: unknown) => {
  if (!isSimulationRequest(message)) return;
  void run(message, workerPort);
});

async function run(request: SimulationRequest, port: typeof workerPort): Promise<void> {
  try {
    const odds = await simulate(request.snapshot);
    port.postMessage({ id: request.id, ok: true, odds });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "Unknown simulator failure";
    port.postMessage({ id: request.id, ok: false, error: detail });
  }
}

function isSimulationRequest(value: unknown): value is SimulationRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "number" &&
    "snapshot" in value &&
    typeof value.snapshot === "object" &&
    value.snapshot !== null
  );
}
