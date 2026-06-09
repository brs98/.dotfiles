import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_TIMEOUT_MS,
  type ClientRegistry,
  type McpClient,
  type McpTool,
} from "./clients.js";
import { loadConfig, type McpConfig } from "./config.js";

export function formatMcpContent(result: unknown): string {
  if (!result || typeof result !== "object") return JSON.stringify(result, null, 2);

  const maybeContent = result as {
    content?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
    isError?: boolean;
  };
  if (!Array.isArray(maybeContent.content)) return JSON.stringify(result, null, 2);

  return maybeContent.content
    .map((part) => {
      if (part.type === "text" && typeof part.text === "string") return part.text;
      return JSON.stringify(part, null, 2);
    })
    .join("\n");
}

export function formatToolList(tools: McpTool[]): string {
  if (tools.length === 0) return "No tools returned by MCP server.";
  return tools
    .map((tool) => `- ${tool.name}${tool.description ? ` — ${tool.description}` : ""}`)
    .join("\n");
}

export function parseCommandArgs(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaping = false;

  for (const char of input.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) args.push(current);
  return args;
}

function parseJsonObject(raw: string | undefined): Record<string, unknown> {
  if (!raw?.trim()) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("MCP call arguments must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function clientStatusText(
  name: string,
  client: McpClient | undefined,
  failures: Map<string, string>,
): string {
  if (client) return client.state === "ready" ? "running" : client.state;
  const failure = failures.get(name);
  return failure ? `failed: ${failure}` : "lazy";
}

function formatServerList(
  config: McpConfig,
  clients: Map<string, McpClient>,
  failures: Map<string, string>,
  paths: string[],
): string {
  const servers = Object.entries(config.servers ?? {});
  const body =
    servers.length === 0
      ? "No MCP servers configured. Add ~/.pi/agent/mcp.json or .pi/mcp.json."
      : servers
          .map(
            ([name, server]) =>
              `- ${name} (${server.type}) ${clientStatusText(name, clients.get(name), failures)}`,
          )
          .join("\n");

  const pathText =
    paths.length > 0 ? `\n\nConfig:\n${paths.map((path) => `- ${path}`).join("\n")}` : "";
  return `${body}${pathText}`;
}

function formatMcpHelp(): string {
  return [
    "MCP command usage:",
    "",
    "- /mcp or /mcp list — list configured MCP servers",
    "- /mcp tools <server> — lazily start/connect and list server tools",
    "- /mcp call <server> <tool> [json-args] — call a tool",
    "- /mcp stop <server|all> — stop lazy client(s) and clear cached failure state",
    "- /mcp reset <server|all> — alias for stop; useful after failures",
    "- /mcp restart <server> — stop and reconnect/list tools",
  ].join("\n");
}

export function registerMcpCommand(pi: ExtensionAPI, registry: ClientRegistry): void {
  const { clients, failures, getServerConfig, getClient, shutdownClient } = registry;

  function showCommandResult(content: string, details?: unknown): void {
    pi.sendMessage({ customType: "mcp-command", content, display: true, details });
  }

  pi.registerCommand("mcp", {
    description: "Manage lazy MCP servers: list, tools, call, stop, reset, restart",
    getArgumentCompletions(prefix) {
      const parts = parseCommandArgs(prefix);
      const subcommands = ["list", "tools", "call", "stop", "reset", "restart", "help"];
      const command = parts[0];

      if (parts.length <= 1 && !prefix.endsWith(" ")) {
        return subcommands
          .filter((subcommand) => subcommand.startsWith(command ?? ""))
          .map((subcommand) => ({ value: subcommand, label: subcommand }));
      }

      return null;
    },
    handler: async (args, ctx) => {
      const argv = parseCommandArgs(args);
      const command = argv[0] ?? "list";
      const timeoutMs = DEFAULT_TIMEOUT_MS;

      try {
        if (command === "help" || command === "--help" || command === "-h") {
          showCommandResult(formatMcpHelp());
          return;
        }

        if (command === "list" || command === "status") {
          const { config, paths } = await loadConfig(ctx.cwd);
          showCommandResult(formatServerList(config, clients, failures, paths));
          return;
        }

        if (command === "tools") {
          const server = argv[1];
          if (!server) throw new Error("Usage: /mcp tools <server>");
          const config = await getServerConfig(ctx, server);
          const client = await getClient(ctx, server);
          const tools = await client.listTools(timeoutMs);
          showCommandResult(formatToolList(tools), {
            server,
            type: config.type,
            running: true,
            tools,
          });
          return;
        }

        if (command === "call") {
          const server = argv[1];
          const tool = argv[2];
          if (!server || !tool) throw new Error("Usage: /mcp call <server> <tool> [json-args]");
          const jsonStart = args.indexOf(tool) + tool.length;
          const jsonArgs = parseJsonObject(args.slice(jsonStart).trim());
          const config = await getServerConfig(ctx, server);
          const client = await getClient(ctx, server);
          const result = await client.callTool(tool, jsonArgs, timeoutMs);
          showCommandResult(formatMcpContent(result), {
            server,
            type: config.type,
            running: true,
            tool,
            result,
          });
          return;
        }

        if (command === "stop" || command === "reset") {
          const server = argv[1];
          if (!server) throw new Error(`Usage: /mcp ${command} <server|all>`);
          if (server === "all") {
            const count = clients.size;
            const failureCount = failures.size;
            for (const name of clients.keys()) shutdownClient(name);
            failures.clear();
            showCommandResult(
              `Reset ${count} MCP client${count === 1 ? "" : "s"} and cleared ${failureCount} failure${failureCount === 1 ? "" : "s"}.`,
            );
            return;
          }
          const stopped = shutdownClient(server);
          showCommandResult(
            stopped
              ? `Reset MCP server ${server}.`
              : `MCP server ${server} was not running; cleared cached state.`,
          );
          return;
        }

        if (command === "restart") {
          const server = argv[1];
          if (!server) throw new Error("Usage: /mcp restart <server>");
          shutdownClient(server);
          const config = await getServerConfig(ctx, server);
          const client = await getClient(ctx, server);
          const tools = await client.listTools(timeoutMs);
          showCommandResult(`Restarted ${server}.\n\n${formatToolList(tools)}`, {
            server,
            type: config.type,
            running: true,
            tools,
          });
          return;
        }

        throw new Error(`Unknown /mcp command "${command}".\n\n${formatMcpHelp()}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showCommandResult(`MCP command failed: ${message}`);
      }
    },
  });
}
