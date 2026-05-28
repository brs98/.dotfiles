import type { RouteTaskInput, RoutingDecision } from "./types";

export function renderRoutingDecision(task: RouteTaskInput, decision: RoutingDecision): string {
  return [
    `# Agent route: ${task.title}`,
    "",
    `Kind: ${decision.kind}`,
    decision.primaryAgentId ? `Primary: ${decision.primaryAgentId}` : undefined,
    renderList(
      "Collaborators",
      decision.agentWork.filter((work) => work.role === "collaborator").map((work) => work.agentId),
    ),
    renderDecisionMessages(decision),
    renderPathFindings(decision),
    renderAgentWork(decision),
    renderList("Global validations", decision.globalValidations),
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export function renderRoutingDecisionLines(
  task: RouteTaskInput,
  decision: RoutingDecision,
): string[] {
  return renderRoutingDecision(task, decision).split("\n");
}

function renderDecisionMessages(decision: RoutingDecision): string {
  return renderList(
    decision.kind === "blocked" ? "Blocked reasons" : "Routing notes",
    decision.blockedReasons,
  );
}

function renderPathFindings(decision: RoutingDecision): string {
  if (decision.pathFindings.length === 0) return "Path findings: none";

  return [
    "Path findings:",
    ...decision.pathFindings.map((finding) => {
      const owners = finding.owners.length > 0 ? finding.owners.join(",") : "none";
      const editableBy = finding.editableBy.length > 0 ? finding.editableBy.join(",") : "none";
      const protectedBy =
        finding.protectedBy.length > 0 ? ` protected=${finding.protectedBy.join(",")}` : "";
      return `- ${finding.mode} ${finding.path}: ${finding.status} owners=${owners} editableBy=${editableBy}${protectedBy}`;
    }),
  ].join("\n");
}

function renderAgentWork(decision: RoutingDecision): string {
  if (decision.agentWork.length === 0) return "Agent work: none";

  return [
    "Agent work:",
    ...decision.agentWork.flatMap((work) => [
      `- ${work.role} ${work.agentId}`,
      `  edit: ${work.editPaths.length > 0 ? work.editPaths.join(", ") : "none"}`,
      `  read: ${work.readPaths.length > 0 ? work.readPaths.join(", ") : "none"}`,
      `  skills: ${work.requiredSkills.length > 0 ? work.requiredSkills.join(", ") : "none"}`,
      `  subagent: ${formatSubagentInvocationSummary(work)}`,
    ]),
  ].join("\n");
}

function renderList(title: string, items: readonly string[]): string {
  if (items.length === 0) return `${title}: none`;
  return [`${title}:`, ...items.map((item) => `- ${item}`)].join("\n");
}

function formatSubagentInvocationSummary(work: RoutingDecision["agentWork"][number]): string {
  return `${work.subagentInvocation.toolName} role=${work.agentId} cwd=${work.subagentInvocation.arguments.cwd}`;
}
