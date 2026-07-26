import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { JournalRecord, WorkflowJournal } from "./host.js";

export const JOURNAL_ENTRY_TYPE = "workflow:agent-result";
export const SCRIPT_ENTRY_TYPE = "workflow:script";

/** Cap persisted agent outputs so the session file stays manageable. */
const MAX_PERSISTED_RESULT_CHARS = 200_000;

export type AppendEntry = <T = unknown>(customType: string, data?: T) => void;

interface JournalEntryData {
  runId: string;
  key: string;
  record: JournalRecord;
}

interface ScriptEntryData {
  runId: string;
  script: string;
  args?: unknown;
}

/**
 * Journal backed by pi custom session entries. Records live in memory for the
 * current process and are appended to the session so a later run (same
 * session, `resumeFromRunId`) can replay them via {@link loadJournalRecords}.
 */
export class SessionJournal implements WorkflowJournal {
  private readonly records: Map<string, JournalRecord>;

  constructor(
    private readonly runId: string,
    private readonly append: AppendEntry,
    previous?: Map<string, JournalRecord>,
  ) {
    this.records = previous ?? new Map();
  }

  get(key: string): JournalRecord | undefined {
    return this.records.get(key);
  }

  put(key: string, record: JournalRecord): void {
    const persistable: JournalRecord =
      typeof record.result === "string" && record.result.length > MAX_PERSISTED_RESULT_CHARS
        ? {
            ...record,
            result: `${record.result.slice(0, MAX_PERSISTED_RESULT_CHARS)}\n[workflow journal: output truncated]`,
          }
        : record;
    this.records.set(key, persistable);
    try {
      this.append<JournalEntryData>(JOURNAL_ENTRY_TYPE, {
        runId: this.runId,
        key,
        record: persistable,
      });
    } catch {
      // Journaling is best-effort; the in-memory record still serves this run.
    }
  }
}

function customEntryData<T>(ctx: ExtensionContext, customType: string): T[] {
  return ctx.sessionManager
    .getBranch()
    .filter((entry): entry is typeof entry & { customType?: string; data?: unknown } => {
      const candidate = entry as { type?: string; customType?: string };
      return candidate.type === "custom" && candidate.customType === customType;
    })
    .map((entry) => (entry as { data?: unknown }).data as T);
}

export function loadJournalRecords(
  ctx: ExtensionContext,
  runId: string,
): Map<string, JournalRecord> {
  const records = new Map<string, JournalRecord>();
  for (const data of customEntryData<Partial<JournalEntryData>>(ctx, JOURNAL_ENTRY_TYPE)) {
    if (data?.runId === runId && typeof data.key === "string" && data.record) {
      records.set(data.key, data.record);
    }
  }
  return records;
}

export function loadPersistedScript(
  ctx: ExtensionContext,
  runId: string,
): { script: string; args?: unknown } | undefined {
  let latest: { script: string; args?: unknown } | undefined;
  for (const data of customEntryData<Partial<ScriptEntryData>>(ctx, SCRIPT_ENTRY_TYPE)) {
    if (data?.runId === runId && typeof data.script === "string") {
      latest = { script: data.script, args: data.args };
    }
  }
  return latest;
}

export function persistScript(
  append: AppendEntry,
  runId: string,
  script: string,
  args: unknown,
): void {
  try {
    append<ScriptEntryData>(SCRIPT_ENTRY_TYPE, { runId, script, args });
  } catch {
    // Best-effort: resume via resumeFromRunId alone won't work, but the run proceeds.
  }
}
