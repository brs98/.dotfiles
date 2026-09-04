export type Event =
  | { type: "created"; id: string; attempt: number; labels?: readonly string[] }
  | { type: "retry"; id: string; delayMs: number }
  | { type: "closed"; id: string; reason: string | null };

export function parseEvent(input: unknown): Event {
  return input as Event;
}

export function parseEventJson(text: string): Event {
  return JSON.parse(text);
}

export function formatEvent(event: Event): string {
  switch (event.type) {
    case "created": return `created:${event.id}:${event.attempt}`;
    case "retry": return `retry:${event.id}:${event.delayMs}`;
    case "closed": return `closed:${event.id}:${event.reason || "unknown"}`;
  }
}

export function getProperty(value: object, key: string): unknown {
  return (value as Record<string, unknown>)[key];
}

export function lookupLabel(labels: ReadonlyMap<string, string>, id: string, fallback: string): string {
  return labels.get(id) || fallback;
}

export function queueLabel(label: string | null, enqueue: (callback: () => string) => void): void {
  if (label) enqueue(() => label!);
  label = null;
}

export const defaultPreferences = Object.freeze({ theme: "system", retries: 3 });
export type StringDictionary = { [key: string]: string };
export type Headers = { requestId: string } & { source: string };
export const exampleStatuses = ["queued"] as const;
export type DeliveryStatus = "queued" | "delivered";
