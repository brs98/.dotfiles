import { Worker } from "node:worker_threads";
import type { CombatSnapshot } from "./domain.js";
import type { SimulationOdds } from "./simulator.js";

interface PendingSimulation {
  readonly resolve: (odds: SimulationOdds) => void;
  readonly reject: (error: Error) => void;
}

interface SimulationReply {
  readonly id: number;
  readonly ok: boolean;
  readonly odds?: SimulationOdds;
  readonly error?: string;
}

export class SimulationClient {
  #worker: Worker | undefined;
  readonly #pending = new Map<number, PendingSimulation>();
  #nextId = 1;
  #closed = false;

  simulate(snapshot: CombatSnapshot): Promise<SimulationOdds> {
    if (this.#closed) return Promise.reject(new Error("The simulator worker is closed."));
    const worker = this.#ensureWorker();
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      worker.postMessage({ id, snapshot });
    });
  }

  close(): void {
    this.#closed = true;
    this.#rejectAll(new Error("The simulator worker was stopped."));
    const worker = this.#worker;
    this.#worker = undefined;
    if (worker) void worker.terminate();
  }

  #ensureWorker(): Worker {
    if (this.#worker) return this.#worker;
    const worker = new Worker(new URL("./simulator-worker.js", import.meta.url));
    worker.on("message", (message: unknown) => this.#handleReply(message));
    worker.on("error", (error: unknown) => {
      this.#worker = undefined;
      this.#rejectAll(error instanceof Error ? error : new Error("The simulator worker failed."));
    });
    worker.on("exit", (code) => {
      if (this.#worker === worker) this.#worker = undefined;
      if (code !== 0 && !this.#closed) {
        this.#rejectAll(new Error(`The simulator worker exited with status ${code}.`));
      }
    });
    this.#worker = worker;
    return worker;
  }

  #handleReply(message: unknown): void {
    if (!isSimulationReply(message)) return;
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    if (message.ok && message.odds) {
      pending.resolve(message.odds);
    } else {
      pending.reject(new Error(message.error ?? "The simulator worker failed."));
    }
  }

  #rejectAll(error: Error): void {
    for (const pending of this.#pending.values()) pending.reject(error);
    this.#pending.clear();
  }
}

function isSimulationReply(value: unknown): value is SimulationReply {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "number" &&
    "ok" in value &&
    typeof value.ok === "boolean"
  );
}
