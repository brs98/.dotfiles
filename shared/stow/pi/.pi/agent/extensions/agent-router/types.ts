export type AgentIntent = "feature" | "bugfix" | "refactor" | "quality" | "docs";

export type AgentId = string;

export type RoutingKind = "single-owner" | "multi-agent" | "blocked" | "needs-triage";

export type RoutedAgentRole = "primary" | "collaborator" | "reviewer";

export type DelegateMode = "primary" | "all";

export type PathMode = "edit" | "read";

export type PathStatus = "allowed" | "read-only" | "blocked" | "unknown";

export interface AgentDefinition {
  readonly id: AgentId;
  readonly label: string;
  readonly description: string;
  readonly priority: number;
  readonly owns: readonly string[];
  readonly mayEdit: readonly string[];
  readonly readOnly: readonly string[];
  readonly requiredSkills: readonly string[];
  readonly validations: readonly string[];
  readonly instructions: readonly string[];
}

export interface ProtectedPathPolicy {
  readonly label: string;
  readonly patterns: readonly string[];
  readonly reason: string;
}

export interface AgentRouterConfig {
  readonly agents: readonly AgentDefinition[];
  readonly protectedPathPolicies: readonly ProtectedPathPolicy[];
}

export interface RouteTaskInput {
  readonly title: string;
  readonly description?: string;
  readonly intent: AgentIntent;
  readonly editPaths: readonly string[];
  readonly readPaths?: readonly string[];
  readonly acceptanceCriteria?: readonly string[];
}

export interface RouteTaskDelegationOptions {
  readonly delegate?: boolean;
  readonly delegateMode?: DelegateMode;
  readonly delegateTimeoutMs?: number;
  readonly delegateModel?: string;
}

export interface PathFinding {
  readonly path: string;
  readonly mode: PathMode;
  readonly owners: readonly AgentId[];
  readonly editableBy: readonly AgentId[];
  readonly protectedBy: readonly string[];
  readonly status: PathStatus;
}

export interface SubagentInvocation {
  readonly toolName: "subagent";
  readonly arguments: {
    readonly task: string;
    readonly role: string;
    readonly cwd: ".";
    readonly tools: readonly string[];
  };
}

export interface RoutedAgentWork {
  readonly agentId: AgentId;
  readonly role: RoutedAgentRole;
  readonly editPaths: readonly string[];
  readonly readPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly requiredSkills: readonly string[];
  readonly validations: readonly string[];
  readonly instructions: readonly string[];
  readonly delegationPrompt: string;
  readonly subagentInvocation: SubagentInvocation;
}

export interface RoutingDecision {
  readonly kind: RoutingKind;
  readonly primaryAgentId?: AgentId;
  readonly agentWork: readonly RoutedAgentWork[];
  readonly pathFindings: readonly PathFinding[];
  readonly blockedReasons: readonly string[];
  readonly globalValidations: readonly string[];
}
