import { resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { assertRequiredRoles, discoverRoles, type RoleScope } from "./roles.js";
import {
  DEFAULT_MAX_REPAIR_CYCLES,
  DEFAULT_TIMEOUT_MS,
  finalSummary,
  makeProgress,
  renderDetails,
  runAgentTeam,
  type TeamRunDetails,
} from "./runner.js";
import { confirmScrollable } from "./ui.js";

export { ScrollableConfirmDialog } from "./ui.js";

const RoleScopeSchema = StringEnum(["user", "project", "both"] as const, {
  description:
    'Which override role directories to use. Bundled roles are always loaded. Default: "user".',
  default: "user",
});

const AgentTeamParams = Type.Object({
  task: Type.String({
    description:
      "User request for the agent team to interpret, research, spec, build, test, and review.",
  }),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory for the team. Relative paths resolve against current pi cwd.",
    }),
  ),
  roleScope: Type.Optional(RoleScopeSchema),
  confirmProjectRoles: Type.Optional(
    Type.Boolean({
      description: "Prompt before using project-local role overrides. Default: true.",
      default: true,
    }),
  ),
  maxRepairCycles: Type.Optional(
    Type.Number({
      description: `Maximum builder/tester/reviewer repair loops. Default: ${DEFAULT_MAX_REPAIR_CYCLES}.`,
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Number({
      description: `Timeout per role subprocess in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.`,
    }),
  ),
});

export default function agentTeam(pi: ExtensionAPI) {
  pi.registerCommand("team", {
    description: "Run the agent-team workflow for a task",
    handler: async (args) => {
      const task = args.trim();
      if (!task) {
        pi.sendUserMessage("Explain how to use the /team command and agent_team tool.");
        return;
      }
      pi.sendUserMessage(
        `Use the agent_team tool to run this task through the full team workflow: ${task}`,
      );
    },
  });

  pi.registerTool({
    name: "agent_team",
    label: "Agent Team",
    description:
      "Run an automatic multi-agent team workflow with human alignment and build checkpoints. Roles: interpreter, researcher, spec-writer, builder, tester, reviewer.",
    promptSnippet:
      "Run a full agent-team workflow with interpreter, research, spec, build, test, review, and repair loops.",
    promptGuidelines: [
      "Use agent_team when the user asks to build or change code using the coordinated team workflow.",
      "agent_team already includes human alignment and build checkpoints; do not ask for duplicate approval before calling it unless the user's request itself is unclear.",
      "Give agent_team the complete user request and any important constraints because each role runs in an isolated session.",
    ],
    parameters: AgentTeamParams,

    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const cwd = params.cwd ? resolve(ctx.cwd, params.cwd) : ctx.cwd;
      const roleScope: RoleScope = params.roleScope ?? "user";
      const discovery = discoverRoles(cwd, roleScope);
      const missing = assertRequiredRoles(discovery.roles);
      if (missing) return { content: [{ type: "text", text: missing }], details: undefined };

      const confirmProjectRoles = params.confirmProjectRoles ?? true;
      const projectRoles = Array.from(discovery.roles.values()).filter(
        (role) => role.source === "project",
      );
      if (projectRoles.length > 0 && confirmProjectRoles) {
        if (!ctx.hasUI) {
          return {
            content: [
              {
                type: "text",
                text: "Canceled: project-local agent-team roles require interactive confirmation.",
              },
            ],
            details: undefined,
          };
        }

        const ok = await confirmScrollable(
          ctx.ui,
          "Use project-local agent-team roles?",
          `Project role overrides are repo-controlled.\n\nRoles: ${projectRoles.map((role) => role.name).join(", ")}\nSource: ${discovery.projectRolesDir ?? "(unknown)"}`,
        );
        if (!ok) {
          return {
            content: [
              { type: "text", text: "Canceled: project-local agent-team roles were not approved." },
            ],
            details: undefined,
          };
        }
      }

      const details = await runAgentTeam({
        task: params.task,
        cwd,
        roles: discovery.roles,
        roleScope,
        projectRolesDir: discovery.projectRolesDir,
        maxRepairCycles: params.maxRepairCycles ?? DEFAULT_MAX_REPAIR_CYCLES,
        timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        signal,
        hasUI: ctx.hasUI,
        confirm: (title, body) => confirmScrollable(ctx.ui, title, body),
        onUpdate: (currentDetails) => {
          onUpdate?.({
            content: [{ type: "text", text: makeProgress(currentDetails) }],
            details: currentDetails,
          });
        },
      });

      return {
        content: [{ type: "text", text: finalSummary(details) }],
        details,
      };
    },

    renderCall(args, theme) {
      const task = typeof args.task === "string" ? args.task : "...";
      const preview = task.length > 100 ? `${task.slice(0, 100)}...` : task;
      return new Text(
        `${theme.fg("toolTitle", theme.bold("agent_team"))}\n${theme.fg("dim", preview)}`,
        0,
        0,
      );
    },

    renderResult(result, { expanded, isPartial }, theme) {
      const details = result.details as TeamRunDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "(no agent-team output)", 0, 0);
      }

      const rendered = renderDetails(details, expanded || isPartial);
      const color = details.completed ? "success" : isPartial ? "warning" : "muted";
      return new Text(theme.fg(color, rendered), 0, 0);
    },
  });
}
