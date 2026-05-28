import { defaultAgentRouterConfig } from "./config";
import { buildDelegationPrompt } from "./delegation-prompt";
import { findPathFinding, matchesAny, uniquePaths } from "./path-policy";
import type {
  AgentDefinition,
  AgentId,
  PathFinding,
  ProtectedPathPolicy,
  RouteTaskInput,
  RoutedAgentRole,
  RoutedAgentWork,
  RoutingDecision,
} from "./types";

export function routeAgentTask(
  rawTask: RouteTaskInput,
  agents: readonly AgentDefinition[] = defaultAgentRouterConfig.agents,
  policies: readonly ProtectedPathPolicy[] = defaultAgentRouterConfig.protectedPathPolicies,
): RoutingDecision {
  const task = normalizeTaskInput(rawTask);
  const editPathFindings = task.editPaths.map((path) =>
    findPathFinding(path, "edit", agents, policies),
  );
  const readPathFindings = (task.readPaths ?? []).map((path) =>
    findPathFinding(path, "read", agents, policies),
  );
  const pathFindings = [...editPathFindings, ...readPathFindings];
  const blockedReasons = buildBlockedReasons(editPathFindings, policies);

  if (blockedReasons.length > 0) {
    return {
      kind: "blocked",
      agentWork: [],
      pathFindings,
      blockedReasons,
      globalValidations: [],
    };
  }

  const candidateAgents = getCandidateAgents(agents, task, editPathFindings);
  if (candidateAgents.length === 0) {
    return {
      kind: "needs-triage",
      primaryAgentId: "repo-coordinator",
      agentWork: [buildCoordinatorWork(task, agents, pathFindings)],
      pathFindings,
      blockedReasons: ["No specialized agent owns or may edit the requested edit paths."],
      globalValidations: ["pnpm check"],
    };
  }

  const primaryAgent = choosePrimaryAgent(candidateAgents, task);
  const collaboratorAgents = candidateAgents.filter((agent) => agent.id !== primaryAgent.id);
  const allRoutedAgents = [primaryAgent, ...collaboratorAgents];
  const agentWork = allRoutedAgents.map((agent) =>
    buildAgentWork({
      task,
      agent,
      role: agent.id === primaryAgent.id ? "primary" : "collaborator",
      agents: allRoutedAgents,
      pathFindings,
    }),
  );

  return {
    kind: collaboratorAgents.length > 0 ? "multi-agent" : "single-owner",
    primaryAgentId: primaryAgent.id,
    agentWork,
    pathFindings,
    blockedReasons: [],
    globalValidations: uniqueFlatMap(agentWork, (work) => work.validations),
  };
}

function normalizeTaskInput(task: RouteTaskInput): RouteTaskInput {
  return {
    ...task,
    editPaths: uniquePaths(task.editPaths),
    readPaths: uniquePaths(task.readPaths),
    acceptanceCriteria: task.acceptanceCriteria
      ?.map((criterion) => criterion.trim())
      .filter((criterion) => criterion.length > 0),
  };
}

function getCandidateAgents(
  agents: readonly AgentDefinition[],
  task: RouteTaskInput,
  editPathFindings: readonly PathFinding[],
): readonly AgentDefinition[] {
  const agentIds = new Set<AgentId>();

  for (const finding of editPathFindings) {
    for (const agentId of finding.editableBy) {
      agentIds.add(agentId);
    }
    for (const agentId of finding.owners) {
      agentIds.add(agentId);
    }
  }

  for (const readPath of task.readPaths ?? []) {
    const matchingReadAgents = agents.filter(
      (agent) => agent.id !== "repo-coordinator" && matchesAny(agent.owns, readPath),
    );
    for (const agent of matchingReadAgents) {
      if (task.intent === "docs" || task.intent === "quality") agentIds.add(agent.id);
    }
  }

  return agents.filter((agent) => agent.id !== "repo-coordinator" && agentIds.has(agent.id));
}

function choosePrimaryAgent(
  agents: readonly AgentDefinition[],
  task: RouteTaskInput,
): AgentDefinition {
  const sortedAgents = [...agents].sort(
    (left, right) => scoreAgent(right, task) - scoreAgent(left, task),
  );
  const firstAgent = sortedAgents[0];
  if (firstAgent) return firstAgent;
  throw new Error("Cannot choose a primary agent without candidate agents.");
}

function scoreAgent(agent: AgentDefinition, task: RouteTaskInput): number {
  const ownedEditCount = task.editPaths.filter((path) => matchesAny(agent.owns, path)).length;
  const editableEditCount = task.editPaths.filter((path) => matchesAny(agent.mayEdit, path)).length;
  const ownedReadCount = (task.readPaths ?? []).filter((path) =>
    matchesAny(agent.owns, path),
  ).length;
  const firstEditPath = task.editPaths[0];
  const firstPathBonus = firstEditPath && matchesAny(agent.mayEdit, firstEditPath) ? 25 : 0;
  const intentBonus = getIntentBonus(agent.id, task.intent);

  return (
    agent.priority +
    firstPathBonus +
    intentBonus +
    editableEditCount * 10 +
    ownedEditCount * 5 +
    ownedReadCount
  );
}

function getIntentBonus(agentId: AgentId, intent: RouteTaskInput["intent"]): number {
  if (intent === "quality" && agentId === "quality") return 20;
  if (intent === "docs" && agentId === "i18n") return 5;
  return 0;
}

function buildAgentWork(input: {
  readonly task: RouteTaskInput;
  readonly agent: AgentDefinition;
  readonly role: RoutedAgentRole;
  readonly agents: readonly AgentDefinition[];
  readonly pathFindings: readonly PathFinding[];
}): RoutedAgentWork {
  const { task, agent, role, agents, pathFindings } = input;
  const editablePaths = pathFindings
    .filter((finding) => finding.mode === "edit" && finding.editableBy.includes(agent.id))
    .map((finding) => finding.path);
  const ownedReadPaths = pathFindings
    .filter((finding) => finding.mode === "read" && finding.owners.includes(agent.id))
    .map((finding) => finding.path);
  const sharedReadPaths = pathFindings
    .filter((finding) => finding.mode === "edit" && !finding.editableBy.includes(agent.id))
    .map((finding) => finding.path);
  const forbiddenPaths = pathFindings
    .filter((finding) => finding.protectedBy.length > 0)
    .map((finding) => finding.path);
  const collaboratorLabels = agents
    .filter((candidate) => candidate.id !== agent.id)
    .map((candidate) => candidate.label);
  const readPaths = Array.from(new Set([...ownedReadPaths, ...sharedReadPaths]));
  const delegationPrompt = buildDelegationPrompt({
    task,
    agent,
    role,
    editPaths: editablePaths,
    readPaths,
    forbiddenPaths,
    collaboratorLabels,
  });

  return {
    agentId: agent.id,
    role,
    editPaths: editablePaths,
    readPaths,
    forbiddenPaths,
    requiredSkills: agent.requiredSkills,
    validations: agent.validations,
    instructions: agent.instructions,
    delegationPrompt,
    subagentInvocation: buildSubagentInvocation({
      agent,
      role,
      task: delegationPrompt,
    }),
  };
}

function buildCoordinatorWork(
  task: RouteTaskInput,
  agents: readonly AgentDefinition[],
  pathFindings: readonly PathFinding[],
): RoutedAgentWork {
  const coordinator = getAgent(agents, "repo-coordinator");
  const forbiddenPaths = pathFindings
    .filter((finding) => finding.status === "blocked")
    .map((finding) => finding.path);
  const editPaths = task.editPaths.filter((path) => matchesAny(coordinator.mayEdit, path));
  const readPaths = pathFindings
    .map((finding) => finding.path)
    .filter((path) => !editPaths.includes(path));
  const delegationPrompt = buildDelegationPrompt({
    task,
    agent: coordinator,
    role: "primary",
    editPaths,
    readPaths,
    forbiddenPaths,
    collaboratorLabels: [],
  });

  return {
    agentId: coordinator.id,
    role: "primary",
    editPaths,
    readPaths,
    forbiddenPaths,
    requiredSkills: coordinator.requiredSkills,
    validations: coordinator.validations,
    instructions: coordinator.instructions,
    delegationPrompt,
    subagentInvocation: buildSubagentInvocation({
      agent: coordinator,
      role: "primary",
      task: delegationPrompt,
    }),
  };
}

function buildSubagentInvocation(input: {
  readonly agent: AgentDefinition;
  readonly role: RoutedAgentRole;
  readonly task: string;
}): RoutedAgentWork["subagentInvocation"] {
  return {
    toolName: "subagent",
    arguments: {
      task: input.task,
      role: `${input.agent.id} ${input.role}: ${input.agent.description}`,
      cwd: ".",
      tools: ["read", "safe_bash", "write", "edit", "route_agent_task"],
    },
  };
}

function buildBlockedReasons(
  editPathFindings: readonly PathFinding[],
  policies: readonly ProtectedPathPolicy[],
): string[] {
  const reasons: string[] = [];

  for (const finding of editPathFindings) {
    if (finding.protectedBy.length > 0) {
      reasons.push(`${finding.path} is protected by ${finding.protectedBy.join(", ")}.`);
      continue;
    }
    if (finding.status === "unknown") {
      reasons.push(`${finding.path} is not editable by any configured specialized agent.`);
    }
  }

  for (const policy of policies) {
    const matchingPaths = editPathFindings
      .filter((finding) => finding.protectedBy.includes(policy.label))
      .map((finding) => finding.path);
    if (matchingPaths.length > 0) {
      reasons.push(`${policy.label}: ${policy.reason}`);
    }
  }

  return Array.from(new Set(reasons));
}

function getAgent(agents: readonly AgentDefinition[], agentId: AgentId): AgentDefinition {
  const agent = agents.find((candidate) => candidate.id === agentId);
  if (agent) return agent;
  throw new Error(`Unknown agent: ${agentId}`);
}

function uniqueFlatMap<T>(items: readonly T[], mapItem: (item: T) => readonly string[]): string[] {
  return Array.from(new Set(items.flatMap((item) => mapItem(item))));
}
