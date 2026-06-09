import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type StdioServerConfig = {
  type: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** MCP stdio framing. The official SDK and mcp-remote use newline-delimited JSON. */
  framing?: "newline" | "content-length";
};

export type HttpServerConfig = {
  type: "http";
  url: string;
  headers?: Record<string, string>;
};

export type ServerConfig = StdioServerConfig | HttpServerConfig;

export type McpConfig = {
  servers?: Record<string, ServerConfig>;
};

function resolveValue(value: string): string {
  const envMatch = value.match(/^\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?$/);
  if (!envMatch) return value;
  return process.env[envMatch[1] ?? ""] ?? "";
}

export function resolveRecord(
  record: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!record) return undefined;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, resolveValue(value)]),
  );
}

export async function loadConfig(cwd: string): Promise<{ config: McpConfig; paths: string[] }> {
  const paths = [join(homedir(), ".pi", "agent", "mcp.json"), resolve(cwd, ".pi", "mcp.json")];
  const merged: McpConfig = { servers: {} };
  const loadedPaths: string[] = [];

  for (const path of paths) {
    if (!existsSync(path)) continue;
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as McpConfig;
    merged.servers = { ...merged.servers, ...parsed.servers };
    loadedPaths.push(path);
  }

  return { config: merged, paths: loadedPaths };
}
