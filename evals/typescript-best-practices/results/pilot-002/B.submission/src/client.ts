export type Event =
  | { type: "created"; id: string; attempt: number; labels?: readonly string[] }
  | { type: "retry"; id: string; delayMs: number }
  | { type: "closed"; id: string; reason: string | null };

export function parseEvent(input: unknown): Event {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Expected an event object");
  }
  if (!("id" in input) || typeof input.id !== "string" || input.id.length === 0) {
    throw new Error("Expected a nonempty event id");
  }
  const id = input.id;
  if (!("type" in input)) throw new Error("Expected an event type");

  switch (input.type) {
    case "created": {
      if (!("attempt" in input) || typeof input.attempt !== "number" ||
          !Number.isInteger(input.attempt) || input.attempt < 0) {
        throw new Error("Expected a finite, nonnegative integer attempt");
      }
      const attempt = input.attempt;
      if (!("labels" in input)) return { type: "created", id, attempt };

      const suppliedLabels: unknown = input.labels;
      if (!Array.isArray(suppliedLabels)) throw new Error("Expected a labels array");
      const labels: string[] = [];
      for (let index = 0; index < suppliedLabels.length; index++) {
        const label: unknown = suppliedLabels[index];
        if (!Object.hasOwn(suppliedLabels, index) || typeof label !== "string") {
          throw new Error("Expected a dense array of string labels");
        }
        labels.push(label);
      }
      return { type: "created", id, attempt, labels };
    }
    case "retry": {
      if (!("delayMs" in input) || typeof input.delayMs !== "number" ||
          !Number.isFinite(input.delayMs) || input.delayMs < 0) {
        throw new Error("Expected a finite, nonnegative delayMs");
      }
      return { type: "retry", id, delayMs: input.delayMs };
    }
    case "closed": {
      if (!("reason" in input) || (typeof input.reason !== "string" && input.reason !== null)) {
        throw new Error("Expected a string or null reason");
      }
      return { type: "closed", id, reason: input.reason };
    }
    default:
      throw new Error("Unknown event type");
  }
}

export function parseEventJson(text: string): Event {
  const input: unknown = JSON.parse(text);
  return parseEvent(input);
}

function assertNever(event: never): never {
  throw new Error("Unknown event type");
}

export function formatEvent(event: Event): string {
  switch (event.type) {
    case "created": return `created:${event.id}:${event.attempt}`;
    case "retry": return `retry:${event.id}:${event.delayMs}`;
    case "closed": return `closed:${event.id}:${event.reason ?? "unknown"}`;
    default: return assertNever(event);
  }
}

export function getProperty<T extends object, K extends keyof T>(value: T, key: K): T[K] {
  return value[key];
}

export function lookupLabel(labels: ReadonlyMap<string, string>, id: string, fallback: string): string {
  return labels.get(id) ?? fallback;
}

export function queueLabel(label: string | null, enqueue: (callback: () => string) => void): void {
  if (label === null) return;
  enqueue(() => label);
}

export const defaultPreferences = Object.freeze({ theme: "system", retries: 3 });
export type StringDictionary = { [key: string]: string };
export type Headers = { requestId: string } & { source: string };
export const exampleStatuses = ["queued"] as const;
export type DeliveryStatus = "queued" | "delivered";
