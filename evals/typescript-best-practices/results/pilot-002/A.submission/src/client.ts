export type Event =
  | { type: "created"; id: string; attempt: number; labels?: readonly string[] }
  | { type: "retry"; id: string; delayMs: number }
  | { type: "closed"; id: string; reason: string | null };

export function parseEvent(input: unknown): Event {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Event must be an object");
  }
  const id = "id" in input ? input.id : undefined;
  if (typeof id !== "string" || id.length === 0) {
    throw new Error("Event id must be a nonempty string");
  }
  if (!("type" in input)) throw new Error("Event type is required");

  switch (input.type) {
    case "created": {
      const attempt = "attempt" in input ? input.attempt : undefined;
      if (typeof attempt !== "number" || !Number.isInteger(attempt) || attempt < 0) {
        throw new Error("Created attempt must be a finite, nonnegative integer");
      }
      if (!("labels" in input)) return { type: "created", id, attempt };
      const suppliedLabels: unknown = input.labels;
      if (!Array.isArray(suppliedLabels)) throw new Error("Labels must be an array");
      const values: readonly unknown[] = suppliedLabels;
      const labels: string[] = [];
      for (let index = 0; index < values.length; index++) {
        const label = values[index];
        if (!Object.hasOwn(values, index) || typeof label !== "string") {
          throw new Error("Labels must be a dense array of strings");
        }
        labels.push(label);
      }
      return { type: "created", id, attempt, labels };
    }
    case "retry": {
      const delayMs = "delayMs" in input ? input.delayMs : undefined;
      if (typeof delayMs !== "number" || !Number.isFinite(delayMs) || delayMs < 0) {
        throw new Error("Retry delayMs must be finite and nonnegative");
      }
      return { type: "retry", id, delayMs };
    }
    case "closed": {
      const reason = "reason" in input ? input.reason : undefined;
      if (reason !== null && typeof reason !== "string") {
        throw new Error("Closed reason must be a string or null");
      }
      return { type: "closed", id, reason };
    }
    default:
      throw new Error("Unknown event type");
  }
}

export function parseEventJson(text: string): Event {
  const input: unknown = JSON.parse(text);
  return parseEvent(input);
}

export function formatEvent(event: Event): string {
  switch (event.type) {
    case "created": return `created:${event.id}:${event.attempt}`;
    case "retry": return `retry:${event.id}:${event.delayMs}`;
    case "closed": return `closed:${event.id}:${event.reason ?? "unknown"}`;
    default: {
      const unhandled: never = event;
      throw new Error(`Unhandled event: ${unhandled}`);
    }
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
  const originalLabel = label;
  enqueue(() => originalLabel);
}

export const defaultPreferences = Object.freeze({ theme: "system", retries: 3 });
export type StringDictionary = { [key: string]: string };
export type Headers = { requestId: string } & { source: string };
export const exampleStatuses = ["queued"] as const;
export type DeliveryStatus = "queued" | "delivered";
