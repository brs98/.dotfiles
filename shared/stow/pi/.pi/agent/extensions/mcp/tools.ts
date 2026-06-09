import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { DEFAULT_TIMEOUT_MS, type ClientRegistry, type McpTool } from "./clients.js";
import { loadConfig, type ServerConfig } from "./config.js";
import { clientStatusText, formatMcpContent, formatToolList } from "./commands.js";

type McpDetails = {
  server: string;
  type: ServerConfig["type"];
  running?: boolean;
  tools?: McpTool[];
  tool?: string;
  result?: unknown;
};

const ListToolsParams = Type.Object({
  server: Type.String({ description: "Configured MCP server name." }),
  timeoutMs: Type.Optional(
    Type.Number({ description: `Timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.` }),
  ),
});

const CallToolParams = Type.Object({
  server: Type.String({ description: "Configured MCP server name." }),
  tool: Type.String({ description: "MCP tool name to call." }),
  arguments: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: "Arguments to pass to the MCP tool.",
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Number({ description: `Timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.` }),
  ),
});

const ResetServerParams = Type.Object({
  server: Type.String({
    description: 'Configured MCP server name, or "all" to reset every server.',
  }),
});

export function registerMcpTools(pi: ExtensionAPI, registry: ClientRegistry): void {
  const { clients, failures, getServerConfig, getClient, shutdownClient } = registry;

  pi.registerTool({
    name: "mcp_list_servers",
    label: "MCP Servers",
    description: "List configured MCP servers. Does not start lazy servers.",
    promptSnippet: "List configured lazy MCP servers.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const { config, paths } = await loadConfig(ctx.cwd);
      const servers = Object.entries(config.servers ?? {});
      const text =
        servers.length === 0
          ? "No MCP servers configured. Add ~/.pi/agent/mcp.json or .pi/mcp.json."
          : servers
              .map(
                ([name, server]) =>
                  `- ${name} (${server.type}) ${clientStatusText(name, clients.get(name), failures)}`,
              )
              .join("\n");
      return {
        content: [{ type: "text", text }],
        details: {
          paths,
          servers: servers.map(([name, server]) => {
            const client = clients.get(name);
            return {
              name,
              type: server.type,
              running: client?.state === "ready",
              state: client?.state ?? (failures.has(name) ? "failed" : "lazy"),
              error: failures.get(name),
            };
          }),
        },
      };
    },
  });

  pi.registerTool({
    name: "mcp_list_tools",
    label: "MCP Tools",
    description: "Start/connect to one MCP server lazily and list its tools.",
    promptSnippet: "List tools for a configured MCP server, starting it lazily if needed.",
    parameters: ListToolsParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const config = await getServerConfig(ctx, params.server);
      const client = await getClient(ctx, params.server);
      const tools = await client.listTools(timeoutMs);
      return {
        content: [{ type: "text", text: formatToolList(tools) }],
        details: {
          server: params.server,
          type: config.type,
          running: true,
          tools,
        } satisfies McpDetails,
      };
    },
    renderCall(args, theme) {
      return new Text(
        theme.fg("toolTitle", theme.bold("mcp_list_tools ")) +
          theme.fg("accent", args.server ?? "..."),
        0,
        0,
      );
    },
  });

  pi.registerTool({
    name: "mcp_reset_server",
    label: "MCP Reset",
    description:
      "Reset one MCP server client, or all clients, clearing cached failure/running state without starting servers.",
    promptSnippet: "Reset a stuck MCP server client and clear cached failure state.",
    parameters: ResetServerParams,
    async execute(_id, params) {
      if (params.server === "all") {
        const count = clients.size;
        const failureCount = failures.size;
        for (const name of clients.keys()) shutdownClient(name);
        failures.clear();
        return {
          content: [
            {
              type: "text",
              text: `Reset ${count} MCP client${count === 1 ? "" : "s"} and cleared ${failureCount} failure${failureCount === 1 ? "" : "s"}.`,
            },
          ],
          details: { server: params.server, reset: count, clearedFailures: failureCount },
        };
      }

      const stopped = shutdownClient(params.server);
      return {
        content: [
          {
            type: "text",
            text: stopped
              ? `Reset MCP server ${params.server}.`
              : `MCP server ${params.server} was not running; cleared cached state.`,
          },
        ],
        details: { server: params.server, reset: stopped ? 1 : 0, clearedFailures: 0 },
      };
    },
  });

  pi.registerTool({
    name: "mcp_call_tool",
    label: "MCP Call",
    description: "Start/connect to one MCP server lazily and call one of its tools.",
    promptSnippet: "Call a tool on a configured MCP server, starting it lazily if needed.",
    parameters: CallToolParams,
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const config = await getServerConfig(ctx, params.server);
      const client = await getClient(ctx, params.server);
      const result = await client.callTool(params.tool, params.arguments ?? {}, timeoutMs);
      return {
        content: [{ type: "text", text: formatMcpContent(result) }],
        details: {
          server: params.server,
          type: config.type,
          running: true,
          tool: params.tool,
          result,
        } satisfies McpDetails,
      };
    },
    renderCall(args, theme) {
      let text =
        theme.fg("toolTitle", theme.bold("mcp_call_tool ")) +
        theme.fg("accent", args.server ?? "...");
      text += theme.fg("muted", ` ${args.tool ?? "..."}`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded }, theme) {
      const details = result.details as McpDetails | undefined;
      const content = result.content[0];
      let text = theme.fg("success", "✓ ") + theme.fg("toolTitle", "MCP");
      if (details)
        text += theme.fg("muted", ` ${details.server}${details.tool ? `.${details.tool}` : ""}`);
      if (content?.type === "text") {
        const output = expanded ? content.text : content.text.split("\n").slice(0, 12).join("\n");
        text += `\n${theme.fg("toolOutput", output)}`;
      }
      return new Text(text, 0, 0);
    },
  });
}
