import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { OverlayState } from "./domain.js";

export class StateWriter {
  readonly #path: string;
  #pending: Promise<void> = Promise.resolve();
  #sequence = 0;

  constructor(path: string) {
    this.#path = path;
  }

  write(state: OverlayState): Promise<void> {
    const next = this.#pending.catch(() => undefined).then(() => this.#writeNow(state));
    this.#pending = next;
    return next;
  }

  async #writeNow(state: OverlayState): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    const temporaryPath = `${this.#path}.tmp-${process.pid}-${this.#sequence++}`;
    await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.#path);
  }
}
