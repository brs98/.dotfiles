import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "typebox";

type JsonRpcMessage = {
  jsonrpc?: "2.0";
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

type StdioServerConfig = {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

type HttpServerConfig = {
  type: "http";
  url: string;
  headers?: Record<string, string>;
};

type ServerConfig = StdioServerConfig | HttpServerConfig;

type McpConfig = {
  servers?: Record<string, ServerConfig>;
};

type McpDetails = {
  server: string;
  type: ServerConfig["type"];
  running?: boolean;
  tools?: McpTool[];
  tool?: string;
  result?: unknown;
};

type McpClient = StdioMcpClient | HttpMcpClient;

const DEFAULT_TIMEOUT_MS = 30_000;
const PROTOCOL_VERSION = "2024-11-05";

const ListToolsParams = Type.Object({
  server: Type.String({ description: "Configured MCP server name." }),
  timeoutMs: Type.Optional(Type.Number({ description: `Timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.` })),
});

const CallToolParams = Type.Object({
  server: Type.String({ description: "Configured MCP server name." }),
  tool: Type.String({ description: "MCP tool name to call." }),
  arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Arguments to pass to the MCP tool." })),
  timeoutMs: Type.Optional(Type.Number({ description: `Timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.` })),
});

function expandPath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function resolveValue(value: string): string {
  const envMatch = value.match(/^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/);
  if (!envMatch) return value;
  return process.env[envMatch[1] ?? ""] ?? "";
}

function resolveRecord(record: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!record) return undefined;
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, resolveValue(value)]));
}

async function loadConfig(cwd: string): Promise<{ config: McpConfig; paths: string[] }> {
  const paths = [join(homedir(), ".pi", "agent", "mcp.json"), resolve(cwd, ".pi", "mcp.json")];
  const merged: McpConfig = { servers: {} };
  const loadedPaths: string[] = [];

  for (const path of paths) {
    if (!existsSync(path)) continue;
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as McpConfig;
    merged.servers = { ...(merged.servers ?? {}), ...(parsed.servers ?? {}) };
    loadedPaths.push(path);
  }

  return { config: merged, paths: loadedPaths };
}

function formatMcpContent(result: unknown): string {
  if (!result || typeof result !== "object") return JSON.stringify(result, null, 2);

  const maybeContent = result as { content?: Array<{ type?: string; text?: string; [key: string]: unknown }>; isError?: boolean };
  if (!Array.isArray(maybeContent.content)) return JSON.stringify(result, null, 2);

  return maybeContent.content
    .map((part) => {
      if (part.type === "text" && typeof part.text === "string") return part.text;
      return JSON.stringify(part, null, 2);
    })
    .join("\n");
}

function formatToolList(tools: McpTool[]): string {
  if (tools.length === 0) return "No tools returned by MCP server.";
  return tools.map((tool) => `- ${tool.name}${tool.description ? ` — ${tool.description}` : ""}`).join("\n");
}

function parseCommandArgs(input: string): string[] {
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

function formatServerList(config: McpConfig, clients: Map<string, McpClient>, paths: string[]): string {
  const servers = Object.entries(config.servers ?? {});
  const body =
    servers.length === 0
      ? "No MCP servers configured. Add ~/.pi/agent/mcp.json or .pi/mcp.json."
      : servers.map(([name, server]) => `- ${name} (${server.type})${clients.has(name) ? " running" : " lazy"}`).join("\n");

  const pathText = paths.length > 0 ? `\n\nConfig:\n${paths.map((path) => `- ${path}`).join("\n")}` : "";
  return `${body}${pathText}`;
}

function formatMcpHelp(): string {
  return [
    "MCP command usage:",
    "",
    "- /mcp or /mcp list — list configured MCP servers",
    "- /mcp tools <server> — lazily start/connect and list server tools",
    "- /mcp call <server> <tool> [json-args] — call a tool",
    "- /mcp stop <server|all> — stop lazy client(s)",
    "- /mcp restart <server> — stop and reconnect/list tools",
  ].join("\n");
}

class StdioMcpClient {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<
    number | string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private initialized = false;
  private stderr = "";

  constructor(
    readonly name: string,
    readonly config: StdioServerConfig,
    readonly cwd: string,
  ) {
    this.proc = spawn(config.command, config.args ?? [], {
      cwd: config.cwd ? resolve(cwd, expandPath(config.cwd)) : cwd,
      env: { ...process.env, ...resolveRecord(config.env) },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout.on("data", (chunk) => this.onData(chunk));
    this.proc.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString();
    });
    this.proc.on("error", (error) => this.rejectAll(error));
    this.proc.on("close", (code) => this.rejectAll(new Error(`${config.command} exited with code ${code}. ${this.stderr}`)));
  }

  async listTools(timeoutMs: number): Promise<McpTool[]> {
    await this.ensureInitialized(timeoutMs);
    const result = (await this.request("tools/list", {}, timeoutMs)) as { tools?: McpTool[] };
    return result.tools ?? [];
  }

  async callTool(tool: string, args: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    await this.ensureInitialized(timeoutMs);
    return this.request("tools/call", { name: tool, arguments: args }, timeoutMs);
  }

  shutdown(): void {
    void this.request("shutdown", {}, 2_000)
      .catch(() => undefined)
      .finally(() => {
        this.notify("exit", undefined);
        if (!this.proc.killed) this.proc.kill("SIGTERM");
      });
  }

  private async ensureInitialized(timeoutMs: number): Promise<void> {
    if (this.initialized) return;
    await this.request(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "pi-mcp-extension", version: "0.1.0" },
      },
      timeoutMs,
    );
    this.notify("notifications/initialized", {});
    this.initialized = true;
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const id = this.nextId++;
    this.send({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`${this.name} timed out waiting for ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
    });
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  private send(message: JsonRpcMessage): void {
    const body = JSON.stringify(message);
    this.proc.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.buffer.slice(0, headerEnd).toString("utf8");
      const match = header.match(/Content-Length: (\d+)/i);
      if (!match) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const contentLength = Number(match[1]);
      const start = headerEnd + 4;
      const end = start + contentLength;
      if (this.buffer.length < end) return;
      const body = this.buffer.slice(start, end).toString("utf8");
      this.buffer = this.buffer.slice(end);
      this.handleMessage(JSON.parse(body) as JsonRpcMessage);
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (message.id !== undefined && message.method === undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }

    if (message.id !== undefined && message.method) {
      this.send({ jsonrpc: "2.0", id: message.id, result: message.method === "ping" ? {} : null });
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

class HttpMcpClient {
  private sessionId: string | undefined;
  private initialized = false;

  constructor(
    readonly name: string,
    readonly config: HttpServerConfig,
  ) {}

  async listTools(timeoutMs: number): Promise<McpTool[]> {
    await this.ensureInitialized(timeoutMs);
    const result = (await this.request("tools/list", {}, timeoutMs)) as { tools?: McpTool[] };
    return result.tools ?? [];
  }

  async callTool(tool: string, args: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    await this.ensureInitialized(timeoutMs);
    return this.request("tools/call", { name: tool, arguments: args }, timeoutMs);
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    await this.notify("exit", undefined, 2_000).catch(() => undefined);
  }

  private async ensureInitialized(timeoutMs: number): Promise<void> {
    if (this.initialized) return;
    await this.request(
      "initialize",
      {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "pi-mcp-extension", version: "0.1.0" },
      },
      timeoutMs,
    );
    await this.notify("notifications/initialized", {}, timeoutMs).catch(() => undefined);
    this.initialized = true;
  }

  private async request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const response = await this.send({ jsonrpc: "2.0", id: 1, method, params }, timeoutMs);
    if (response.error) throw new Error(response.error.message);
    return response.result;
  }

  private async notify(method: string, params: unknown, timeoutMs: number): Promise<void> {
    await this.send({ jsonrpc: "2.0", method, params }, timeoutMs);
  }

  private async send(message: JsonRpcMessage, timeoutMs: number): Promise<JsonRpcMessage> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(this.config.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
          ...resolveRecord(this.config.headers),
        },
        body: JSON.stringify(message),
        signal: controller.signal,
      });

      const sessionId = response.headers.get("mcp-session-id");
      if (sessionId) this.sessionId = sessionId;
      if (!response.ok) throw new Error(`${this.name} HTTP ${response.status}: ${await response.text()}`);
      if (response.status === 202 || response.status === 204) return { jsonrpc: "2.0", result: null };

      const contentType = response.headers.get("content-type") ?? "";
      const text = await response.text();
      if (contentType.includes("text/event-stream")) return parseSseResponse(text);
      if (!text.trim()) return { jsonrpc: "2.0", result: null };
      return JSON.parse(text) as JsonRpcMessage;
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseSseResponse(text: string): JsonRpcMessage {
  const dataLines = text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());
  const payload = dataLines.at(-1);
  if (!payload) return { jsonrpc: "2.0", result: null };
  return JSON.parse(payload) as JsonRpcMessage;
}

export default function mcp(pi: ExtensionAPI) {
  const clients = new Map<string, StdioMcpClient | HttpMcpClient>();

  async function getServerConfig(ctx: { cwd: string }, server: string): Promise<ServerConfig> {
    const { config } = await loadConfig(ctx.cwd);
    const serverConfig = config.servers?.[server];
    if (!serverConfig) throw new Error(`Unknown MCP server "${server}". Use mcp_list_servers first.`);
    return serverConfig;
  }

  async function getClient(ctx: { cwd: string }, server: string): Promise<McpClient> {
    const existing = clients.get(server);
    if (existing) return existing;
    const config = await getServerConfig(ctx, server);
    const client = config.type === "stdio" ? new StdioMcpClient(server, config, ctx.cwd) : new HttpMcpClient(server, config);
    clients.set(server, client);
    return client;
  }

  function shutdownClient(server: string): boolean {
    const client = clients.get(server);
    if (!client) return false;
    if (client instanceof StdioMcpClient) client.shutdown();
    else void client.shutdown();
    clients.delete(server);
    return true;
  }

  function showCommandResult(content: string, details?: unknown): void {
    pi.sendMessage({ customType: "mcp-command", content, display: true, details });
  }

  pi.registerCommand("mcp", {
    description: "Manage lazy MCP servers: list, tools, call, stop, restart",
    getArgumentCompletions(prefix) {
      const parts = parseCommandArgs(prefix);
      const subcommands = ["list", "tools", "call", "stop", "restart", "help"];
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
          showCommandResult(formatServerList(config, clients, paths));
          return;
        }

        if (command === "tools") {
          const server = argv[1];
          if (!server) throw new Error("Usage: /mcp tools <server>");
          const config = await getServerConfig(ctx, server);
          const client = await getClient(ctx, server);
          const tools = await client.listTools(timeoutMs);
          showCommandResult(formatToolList(tools), { server, type: config.type, running: true, tools });
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
          showCommandResult(formatMcpContent(result), { server, type: config.type, running: true, tool, result });
          return;
        }

        if (command === "stop") {
          const server = argv[1];
          if (!server) throw new Error("Usage: /mcp stop <server|all>");
          if (server === "all") {
            const count = clients.size;
            for (const name of [...clients.keys()]) shutdownClient(name);
            showCommandResult(`Stopped ${count} MCP client${count === 1 ? "" : "s"}.`);
            return;
          }
          const stopped = shutdownClient(server);
          showCommandResult(stopped ? `Stopped MCP server ${server}.` : `MCP server ${server} was not running.`);
          return;
        }

        if (command === "restart") {
          const server = argv[1];
          if (!server) throw new Error("Usage: /mcp restart <server>");
          shutdownClient(server);
          const config = await getServerConfig(ctx, server);
          const client = await getClient(ctx, server);
          const tools = await client.listTools(timeoutMs);
          showCommandResult(`Restarted ${server}.\n\n${formatToolList(tools)}`, { server, type: config.type, running: true, tools });
          return;
        }

        throw new Error(`Unknown /mcp command "${command}".\n\n${formatMcpHelp()}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        showCommandResult(`MCP command failed: ${message}`);
      }
    },
  });

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
              .map(([name, server]) => `- ${name} (${server.type})${clients.has(name) ? " running" : " lazy"}`)
              .join("\n");
      return { content: [{ type: "text", text }], details: { paths, servers: servers.map(([name, server]) => ({ name, type: server.type, running: clients.has(name) })) } };
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
        details: { server: params.server, type: config.type, running: true, tools } satisfies McpDetails,
      };
    },
    renderCall(args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("mcp_list_tools ")) + theme.fg("accent", args.server ?? "..."), 0, 0);
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
        details: { server: params.server, type: config.type, running: true, tool: params.tool, result } satisfies McpDetails,
      };
    },
    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("mcp_call_tool ")) + theme.fg("accent", args.server ?? "...");
      text += theme.fg("muted", ` ${args.tool ?? "..."}`);
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded }, theme) {
      const details = result.details as McpDetails | undefined;
      const content = result.content[0];
      let text = theme.fg("success", "✓ ") + theme.fg("toolTitle", "MCP");
      if (details) text += theme.fg("muted", ` ${details.server}${details.tool ? `.${details.tool}` : ""}`);
      if (content?.type === "text") {
        const output = expanded ? content.text : content.text.split("\n").slice(0, 12).join("\n");
        text += `\n${theme.fg("toolOutput", output)}`;
      }
      return new Text(text, 0, 0);
    },
  });

  pi.on("session_shutdown", () => {
    for (const client of clients.values()) {
      if (client instanceof StdioMcpClient) client.shutdown();
      else void client.shutdown();
    }
    clients.clear();
  });
}
