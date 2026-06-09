import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolve } from "node:path";
import { expandHome } from "../lib/paths.js";
import {
  loadConfig,
  resolveRecord,
  type HttpServerConfig,
  type ServerConfig,
  type StdioServerConfig,
} from "./config.js";

type JsonRpcMessage = {
  jsonrpc?: "2.0";
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type McpTool = {
  name: string;
  description?: string;
  inputSchema?: unknown;
};

export type McpClient = StdioMcpClient | HttpMcpClient;

export type ClientState = "starting" | "initializing" | "ready" | "stopping" | "stopped" | "failed";

export const DEFAULT_TIMEOUT_MS = 30_000;
const PROTOCOL_VERSION = "2024-11-05";

export class StdioMcpClient {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<
    number | string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private initialized = false;
  private stderr = "";
  private closing = false;
  state: ClientState = "starting";
  lastError: string | undefined;

  constructor(
    readonly name: string,
    readonly config: StdioServerConfig,
    readonly cwd: string,
    private readonly onClose: (message: string | undefined) => void,
  ) {
    this.proc = spawn(config.command, config.args ?? [], {
      cwd: config.cwd ? resolve(cwd, expandHome(config.cwd)) : cwd,
      env: { ...process.env, ...resolveRecord(config.env) },
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });

    this.proc.stdout.on("data", (chunk) => this.onData(chunk));
    this.proc.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString();
    });
    this.proc.on("error", (error) => this.fail(error));
    this.proc.on("close", (code, signal) => {
      if (this.closing) return this.finishClose(undefined);
      const suffix = this.stderr.trim() ? ` ${this.stderr.trim().slice(-2_000)}` : "";
      this.fail(
        new Error(
          `${config.command} exited with code ${code}${signal ? ` signal ${signal}` : ""}.${suffix}`,
        ),
      );
    });
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
    if (this.state === "stopped" || this.state === "failed") return;
    this.closing = true;
    this.state = "stopping";
    void this.request("shutdown", {}, 2_000)
      .catch(() => undefined)
      .finally(() => {
        try {
          this.notify("exit", undefined);
        } catch {
          // Ignore best-effort exit notification failures during shutdown.
        }
        this.killProcess();
        this.finishClose(undefined);
      });
  }

  private async ensureInitialized(timeoutMs: number): Promise<void> {
    if (this.initialized) return;
    this.state = "initializing";
    try {
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
      this.state = "ready";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.fail(new Error(message));
      throw error;
    }
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    if (this.state === "failed" || this.state === "stopped") {
      return Promise.reject(
        new Error(`${this.name} is ${this.state}${this.lastError ? `: ${this.lastError}` : ""}`),
      );
    }

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
    if (this.config.framing === "content-length") {
      this.proc.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
      return;
    }

    // MCP stdio uses newline-delimited JSON. This is what @modelcontextprotocol/sdk
    // and mcp-remote expect; LSP-style Content-Length framing makes mcp-remote
    // treat the header as JSON and then never answer initialize.
    this.proc.stdin.write(`${body}\n`);
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length > 0) {
      if (
        this.buffer
          .toString("utf8", 0, Math.min(this.buffer.length, 32))
          .startsWith("Content-Length:")
      ) {
        if (!this.parseContentLengthFrame()) return;
        continue;
      }

      const newline = this.buffer.indexOf("\n");
      if (newline === -1) return;
      const line = this.buffer.subarray(0, newline).toString("utf8").trim();
      this.buffer = this.buffer.subarray(newline + 1);
      if (!line) continue;
      this.handleMessage(JSON.parse(line) as JsonRpcMessage);
    }
  }

  private parseContentLengthFrame(): boolean {
    const headerEnd = this.buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return false;
    const header = this.buffer.subarray(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length: (\d+)/i);
    if (!match) {
      this.buffer = this.buffer.subarray(headerEnd + 4);
      return true;
    }
    const contentLength = Number(match[1]);
    const start = headerEnd + 4;
    const end = start + contentLength;
    if (this.buffer.length < end) return false;
    const body = this.buffer.subarray(start, end).toString("utf8");
    this.buffer = this.buffer.subarray(end);
    this.handleMessage(JSON.parse(body) as JsonRpcMessage);
    return true;
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (message.id !== undefined && message.id !== null && message.method === undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }

    if (message.id !== undefined && message.id !== null && message.method) {
      this.send({ jsonrpc: "2.0", id: message.id, result: message.method === "ping" ? {} : null });
    }
  }

  private fail(error: Error): void {
    if (this.state === "failed" || this.state === "stopped") return;
    this.lastError = error.message;
    this.state = "failed";
    this.rejectAll(error);
    this.killProcess();
    this.finishClose(error.message);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private killProcess(): void {
    if (this.proc.killed) return;
    const pid = this.proc.pid;
    if (process.platform !== "win32" && pid) {
      try {
        process.kill(-pid, "SIGTERM");
        setTimeout(() => {
          try {
            process.kill(-pid, "SIGKILL");
          } catch {
            // Process group is already gone.
          }
        }, 1_000).unref();
        return;
      } catch {
        // Fall back to killing the direct child below.
      }
    }
    this.proc.kill("SIGTERM");
  }

  private finishClose(message: string | undefined): void {
    if (!message && this.state !== "failed") this.state = "stopped";
    this.onClose(message);
  }
}

export class HttpMcpClient {
  private sessionId: string | undefined;
  private initialized = false;
  state: ClientState = "starting";
  lastError: string | undefined;

  constructor(
    readonly name: string,
    readonly config: HttpServerConfig,
    private readonly onClose: (message: string | undefined) => void,
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
    if (this.state === "stopped" || this.state === "failed") return;
    this.state = "stopping";
    if (this.initialized) await this.notify("exit", undefined, 2_000).catch(() => undefined);
    this.state = "stopped";
    this.onClose(undefined);
  }

  private async ensureInitialized(timeoutMs: number): Promise<void> {
    if (this.initialized) return;
    this.state = "initializing";
    try {
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
      this.state = "ready";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
      this.state = "failed";
      this.onClose(message);
      throw error;
    }
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
      if (!response.ok)
        throw new Error(`${this.name} HTTP ${response.status}: ${await response.text()}`);
      if (response.status === 202 || response.status === 204)
        return { jsonrpc: "2.0", result: null };

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

export function createClientRegistry() {
  const clients = new Map<string, StdioMcpClient | HttpMcpClient>();
  const failures = new Map<string, string>();

  async function getServerConfig(ctx: { cwd: string }, server: string): Promise<ServerConfig> {
    const { config } = await loadConfig(ctx.cwd);
    const serverConfig = config.servers?.[server];
    if (!serverConfig)
      throw new Error(`Unknown MCP server "${server}". Use mcp_list_servers first.`);
    return serverConfig;
  }

  async function getClient(ctx: { cwd: string }, server: string): Promise<McpClient> {
    const existing = clients.get(server);
    if (existing && existing.state !== "failed" && existing.state !== "stopped") return existing;
    clients.delete(server);
    failures.delete(server);

    const config = await getServerConfig(ctx, server);
    let client: McpClient;
    const onClose = (message: string | undefined) => {
      if (clients.get(server) === client) clients.delete(server);
      if (message) failures.set(server, message);
    };
    client =
      config.type === "stdio"
        ? new StdioMcpClient(server, config, ctx.cwd, onClose)
        : new HttpMcpClient(server, config, onClose);
    clients.set(server, client);
    return client;
  }

  function shutdownClient(server: string): boolean {
    const client = clients.get(server);
    failures.delete(server);
    if (!client) return false;
    if (client instanceof StdioMcpClient) client.shutdown();
    else void client.shutdown();
    clients.delete(server);
    return true;
  }

  function shutdownAll(): void {
    for (const client of clients.values()) {
      if (client instanceof StdioMcpClient) client.shutdown();
      else void client.shutdown();
    }
    clients.clear();
  }

  return { clients, failures, getServerConfig, getClient, shutdownClient, shutdownAll };
}

export type ClientRegistry = ReturnType<typeof createClientRegistry>;
