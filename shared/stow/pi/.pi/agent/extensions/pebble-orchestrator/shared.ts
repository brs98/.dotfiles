export type PebEnvelope<T> = { data: T; schema_version?: number };
export type LabelPolicy = {
  policy?: {
    groups?: Array<{ name?: string; labels?: string[]; cardinality?: string }>;
    strict?: boolean;
    version?: number;
  };
};
export type PebIssue = {
  id: string;
  title: string;
  description?: string;
  issue_type?: string;
  priority?: number;
  status?: string;
  labels?: string[];
  dependencies?: unknown[];
  dependents?: unknown[];
  comments?: Array<{ id?: string; body?: string }>;
  closed_at?: string | null;
  [key: string]: unknown;
};
export type OpenPr = { number?: number; headRefName?: string; url?: string };
export type Workflow = {
  readyLabel?: string;
  reviewLabel?: string;
  stateLabels: string[];
  strictLabels: boolean;
};
export type PlanItem = {
  issue: PebIssue;
  branch: string;
  worktreePath: string;
  area: string;
  risk: "low" | "medium" | "high";
  selectable: boolean;
  blockingReasons: string[];
  existingPr?: OpenPr;
  existingBranch?: string;
};
export type Plan = {
  repo: string;
  gitRoot: string;
  runId: string;
  workflow: Workflow;
  concurrency: number;
  baseRef: string;
  items: PlanItem[];
  selected: PlanItem[];
  openPrs: OpenPr[];
};
export type AgentRole = "planner" | "implementer" | "reviewer";
export type AgentRun = {
  issueId: string;
  role: AgentRole;
  cwd: string;
  model: string;
  exitCode: number | null;
  durationMs: number;
  finalOutput: string;
  stderr: string;
  truncated?: boolean;
  fullOutputPath?: string;
};
export type AgentProgressEvent = {
  issueId: string;
  role: AgentRole;
  phase:
    | "started"
    | "tool_start"
    | "tool_update"
    | "tool_end"
    | "assistant"
    | "stderr"
    | "finished";
  text: string;
  elapsedMs: number;
};
export type RunResult = {
  item: PlanItem;
  worktreePath: string;
  planner?: AgentRun;
  implementer?: AgentRun;
  reviewer?: AgentRun;
  approved: boolean;
  pr?: OpenPr;
  errors: string[];
};
export type Show = (content: string, details?: unknown) => void;

export const DEFAULT_MODEL = "vercel-ai-gateway/moonshotai/kimi-k2.6";
export const DEFAULT_CONCURRENCY = 3;
export const DEFAULT_AGENT_TIMEOUT_MS = 30 * 60 * 1000;

export function jsonData<T>(raw: string): T {
  const parsed = JSON.parse(raw) as PebEnvelope<T>;
  return parsed.data;
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function isClosed(issue: PebIssue): boolean {
  return issue.status === "closed" || issue.closed_at != null;
}

export function isInProgress(issue: PebIssue): boolean {
  return issue.status === "in_progress" || issue.status === "in-progress";
}
