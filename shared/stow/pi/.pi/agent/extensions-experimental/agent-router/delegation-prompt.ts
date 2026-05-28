import type { AgentDefinition, RouteTaskInput, RoutedAgentRole } from "./types";

export function buildDelegationPrompt(input: {
  readonly task: RouteTaskInput;
  readonly agent: AgentDefinition;
  readonly role: RoutedAgentRole;
  readonly editPaths: readonly string[];
  readonly readPaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly collaboratorLabels: readonly string[];
}): string {
  const { task, agent, role } = input;
  return [
    `You are the ${agent.label} for this repository task.`,
    "",
    `Role: ${role}`,
    `Task: ${task.title}`,
    task.description ? `Description: ${task.description}` : undefined,
    `Intent: ${task.intent}`,
    "",
    formatList("Allowed edit paths", input.editPaths),
    formatList("Read-only context paths", input.readPaths),
    formatList("Forbidden/protected paths", input.forbiddenPaths),
    formatList("Required skills to load", agent.requiredSkills),
    formatList("Validation commands to run if relevant", agent.validations),
    formatList("Agent-specific instructions", agent.instructions),
    formatList("Acceptance criteria", task.acceptanceCriteria ?? []),
    formatList("Collaborators", input.collaboratorLabels),
    "Agent Router enforcement:",
    "- Use safe_bash for read-only exploration and validation commands; use write/edit for file changes.",
    "- Before using write or edit, call route_agent_task with these assigned edit paths and useful read paths.",
    "- Stop only if route_agent_task returns kind=blocked, returns no assigned edit paths, or returns assigned edit paths that do not cover the allowed edit paths above.",
    "- kind=needs-triage is not a blocker when you are the assigned repo-coordinator and your assigned edit paths cover the allowed edit paths above.",
    "",
    "Escalation rules:",
    "- Stop and report if required edits fall outside the allowed edit paths.",
    "- Do not edit forbidden/protected paths.",
    "- Ask the coordinator before broadening scope or running destructive commands.",
    "",
    "Final report format:",
    "## Summary",
    "- ...",
    "",
    "## Changed files",
    "- path: reason",
    "",
    "## Validation",
    "- command: pass/fail/not run + reason",
    "",
    "## Risks / follow-ups",
    "- ...",
    "",
    "## Escalations",
    "- none / describe boundary issue",
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function formatList(title: string, items: readonly string[]): string {
  if (items.length === 0) return `${title}: none`;

  return [`${title}:`, ...items.map((item) => `- ${item}`)].join("\n");
}
