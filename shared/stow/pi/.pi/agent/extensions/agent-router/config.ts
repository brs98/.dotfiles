import { existsSync } from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

import type { AgentDefinition, AgentRouterConfig, ProtectedPathPolicy } from "./types";

const repoConfigRelativePath = path.join(".pi", "agent-router.config.ts");

export interface LoadedAgentRouterConfig extends AgentRouterConfig {
  readonly isRepoConfigured: boolean;
  readonly configPath: string;
}

export const builtInProtectedPathPolicies = [
  {
    label: "dependency directories",
    patterns: ["**/node_modules/**", "node_modules/**"],
    reason: "dependency directories are generated and must not be edited.",
  },
  {
    label: "git internals",
    patterns: [".git/**", "**/.git/**"],
    reason: "git internals are managed by git and must not be edited directly.",
  },
] as const satisfies readonly ProtectedPathPolicy[];

const fallbackCoordinatorAgent = {
  id: "repo-coordinator",
  label: "Repo coordinator",
  description:
    "Routes work, creates delegation prompts, reviews reports, and owns coordination-only files.",
  priority: 0,
  owns: ["**"],
  mayEdit: ["**"],
  readOnly: [],
  requiredSkills: [],
  validations: [],
  instructions: [
    "No repository-specific agent-router config was found; treat all routing as needs-triage.",
  ],
} as const satisfies AgentDefinition;

const fallbackAgentRouterConfig = defineAgentRouterConfig({
  agents: [fallbackCoordinatorAgent],
  protectedPathPolicies: [],
});

export const defaultAgentRouterConfig = mergeWithBuiltIns(fallbackAgentRouterConfig);

export function defineAgentRouterConfig<const T extends AgentRouterConfig>(config: T): T {
  return config;
}

export async function loadAgentRouterConfig(cwd: string): Promise<LoadedAgentRouterConfig> {
  const configPath = path.join(cwd, repoConfigRelativePath);
  const repoConfig = await loadRepoConfig(configPath);
  return {
    ...mergeWithBuiltIns(repoConfig ?? fallbackAgentRouterConfig),
    isRepoConfigured: repoConfig !== undefined,
    configPath,
  };
}

async function loadRepoConfig(configPath: string): Promise<AgentRouterConfig | undefined> {
  if (!existsSync(configPath)) return undefined;

  const configModule = (await import(pathToFileURL(configPath).href)) as AgentRouterConfigModule;
  const config = configModule.default ?? configModule.agentRouterConfig ?? configModule.config;

  if (!isAgentRouterConfig(config)) {
    throw new Error(
      `Agent Router config at ${configPath} must export an AgentRouterConfig as default, agentRouterConfig, or config.`,
    );
  }

  return config;
}

function mergeWithBuiltIns(config: AgentRouterConfig): AgentRouterConfig {
  const agents = hasAgent(config.agents, fallbackCoordinatorAgent.id)
    ? config.agents
    : [...config.agents, fallbackCoordinatorAgent];

  return {
    agents,
    protectedPathPolicies: [...builtInProtectedPathPolicies, ...config.protectedPathPolicies],
  };
}

function hasAgent(agents: readonly AgentDefinition[], agentId: string): boolean {
  return agents.some((agent) => agent.id === agentId);
}

interface AgentRouterConfigModule {
  readonly default?: unknown;
  readonly agentRouterConfig?: unknown;
  readonly config?: unknown;
}

function isAgentRouterConfig(value: unknown): value is AgentRouterConfig {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.agents) &&
    value.agents.every(isAgentDefinition) &&
    Array.isArray(value.protectedPathPolicies) &&
    value.protectedPathPolicies.every(isProtectedPathPolicy)
  );
}

function isAgentDefinition(value: unknown): value is AgentDefinition {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.description === "string" &&
    typeof value.priority === "number" &&
    Array.isArray(value.owns) &&
    value.owns.every(isString) &&
    Array.isArray(value.mayEdit) &&
    value.mayEdit.every(isString) &&
    Array.isArray(value.readOnly) &&
    value.readOnly.every(isString) &&
    Array.isArray(value.requiredSkills) &&
    value.requiredSkills.every(isString) &&
    Array.isArray(value.validations) &&
    value.validations.every(isString) &&
    Array.isArray(value.instructions) &&
    value.instructions.every(isString)
  );
}

function isProtectedPathPolicy(value: unknown): value is ProtectedPathPolicy {
  if (!isRecord(value)) return false;
  return (
    typeof value.label === "string" &&
    Array.isArray(value.patterns) &&
    value.patterns.every(isString) &&
    typeof value.reason === "string"
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
