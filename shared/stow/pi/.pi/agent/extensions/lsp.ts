// DEPRECATION: this extension is slated to be superseded by the lsp-dap-tools/
// extension once it reaches parity with diagnostics + the cargo-check fallback.
// Delete this file at that point.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { makeTempOutputPath, truncateToFile } from "./lib/output.js";

type Language = "typescript" | "python" | "rust" | "ruby";
type LanguageParam = "auto" | Language;

type JsonRpcMessage = {
  jsonrpc?: "2.0";
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type Diagnostic = {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
};

type DocumentState = {
  version: number;
  languageId: string;
};

type ServerConfig = {
  command: string;
  args: string[];
  languageId(filePath: string): string;
};

type LspDetails = {
  language: Language;
  root: string;
  path: string;
  diagnostics: Diagnostic[];
  formatted: string;
  server: string;
  truncated?: boolean;
  fullOutputPath?: string;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const SERVER_SHUTDOWN_GRACE_MS = 2_000;
const EMPTY_DIAGNOSTICS_QUIET_MS = 750;
const NON_EMPTY_DIAGNOSTICS_QUIET_MS = 500;

const LspDiagnosticsParams = Type.Object({
  path: Type.String({ description: "File path to diagnose. Relative paths resolve against cwd." }),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory. Relative paths resolve against the current pi cwd.",
    }),
  ),
  root: Type.Optional(
    Type.String({ description: "Project root override. Relative paths resolve against cwd." }),
  ),
  language: Type.Optional(
    StringEnum(["auto", "typescript", "python", "rust", "ruby"] as const, {
      description: "Language server to use. Default: auto based on file extension.",
      default: "auto",
    }),
  ),
  timeoutMs: Type.Optional(
    Type.Number({ description: `Timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.` }),
  ),
});

function pathToUri(path: string): string {
  const normalized = path.split("#").join("%23").split("?").join("%3F");
  return `file://${normalized.startsWith("/") ? "" : "/"}${normalized
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function stripAt(path: string): string {
  return path.startsWith("@") ? path.slice(1) : path;
}

async function canonicalizeExistingPath(path: string): Promise<string> {
  return realpath(path);
}

function detectLanguage(filePath: string, requested: LanguageParam | undefined): Language {
  if (requested && requested !== "auto") return requested;

  const ext = extname(filePath).toLowerCase();
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "typescript";
  if (ext === ".py") return "python";
  if (ext === ".rs") return "rust";
  if (ext === ".rb") return "ruby";

  throw new Error(`Could not infer language from extension "${ext}". Pass language explicitly.`);
}

function serverConfig(language: Language): ServerConfig {
  switch (language) {
    case "typescript":
      return {
        command: "typescript-language-server",
        args: ["--stdio"],
        languageId(filePath) {
          const ext = extname(filePath).toLowerCase();
          if (ext === ".tsx") return "typescriptreact";
          if (ext === ".jsx") return "javascriptreact";
          if ([".js", ".mjs", ".cjs"].includes(ext)) return "javascript";
          return "typescript";
        },
      };
    case "python":
      return { command: "pyright-langserver", args: ["--stdio"], languageId: () => "python" };
    case "rust":
      return { command: "rust-analyzer", args: [], languageId: () => "rust" };
    case "ruby":
      return { command: "ruby-lsp", args: [], languageId: () => "ruby" };
  }
}

const ROOT_MARKERS: Record<Language, string[]> = {
  typescript: ["tsconfig.json", "jsconfig.json", "package.json", ".git"],
  python: ["pyrightconfig.json", "pyproject.toml", "setup.py", "requirements.txt", ".git"],
  rust: ["Cargo.toml", ".git"],
  ruby: ["Gemfile", ".ruby-version", ".git"],
};

async function discoverRoot(
  filePath: string,
  language: Language,
  explicitRoot?: string,
): Promise<string> {
  if (explicitRoot) return canonicalizeExistingPath(explicitRoot);

  let current = dirname(filePath);
  while (true) {
    for (const marker of ROOT_MARKERS[language]) {
      if (existsSync(join(current, marker))) return canonicalizeExistingPath(current);
    }

    const parent = dirname(current);
    if (parent === current) return canonicalizeExistingPath(dirname(filePath));
    current = parent;
  }
}

function severityName(severity: number | undefined): string {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "info";
    case 4:
      return "hint";
    default:
      return "diagnostic";
  }
}

function configurationForLanguage(
  language: Language,
  section: string | undefined,
): Record<string, unknown> {
  if (language === "python") {
    if (section === "python.analysis") {
      return {
        diagnosticMode: "openFilesOnly",
        typeCheckingMode: "basic",
        autoSearchPaths: true,
        useLibraryCodeForTypes: true,
      };
    }

    return {};
  }

  return {};
}

function severityFromCargoLevel(level: string | undefined): number {
  switch (level) {
    case "error":
      return 1;
    case "warning":
      return 2;
    case "note":
    case "help":
      return 3;
    default:
      return 4;
  }
}

async function cargoCheckDiagnostics(
  pi: ExtensionAPI,
  root: string,
  filePath: string,
  timeoutMs: number,
): Promise<Diagnostic[]> {
  if (!existsSync(join(root, "Cargo.toml"))) return [];

  const result = await pi.exec("cargo", ["check", "--message-format=json"], {
    cwd: root,
    timeout: timeoutMs,
  });
  const diagnostics: Diagnostic[] = [];

  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue;

    let payload: unknown;
    try {
      payload = JSON.parse(line);
    } catch {
      continue;
    }

    const event = payload as {
      reason?: string;
      message?: {
        level?: string;
        message?: string;
        code?: { code?: string };
        spans?: Array<{
          file_name?: string;
          line_start?: number;
          line_end?: number;
          column_start?: number;
          column_end?: number;
          is_primary?: boolean;
        }>;
      };
    };

    if (event.reason !== "compiler-message" || !event.message?.message) continue;

    const primarySpan =
      event.message.spans?.find((span) => span.is_primary) ?? event.message.spans?.[0];
    const primaryFileName = primarySpan?.file_name;
    if (!primaryFileName) continue;

    const spanPath = await canonicalizeExistingPath(resolve(root, primaryFileName)).catch(() =>
      resolve(root, primaryFileName),
    );
    if (spanPath !== filePath) continue;

    diagnostics.push({
      range: {
        start: {
          line: Math.max(0, (primarySpan.line_start ?? 1) - 1),
          character: Math.max(0, (primarySpan.column_start ?? 1) - 1),
        },
        end: {
          line: Math.max(0, (primarySpan.line_end ?? primarySpan.line_start ?? 1) - 1),
          character: Math.max(0, (primarySpan.column_end ?? primarySpan.column_start ?? 1) - 1),
        },
      },
      severity: severityFromCargoLevel(event.message.level),
      source: "cargo check",
      code: event.message.code?.code,
      message: event.message.message,
    });
  }

  return diagnostics;
}

function formatDiagnostics(filePath: string, diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return `No diagnostics for ${filePath}`;

  return diagnostics
    .map((diagnostic) => {
      const line = diagnostic.range.start.line + 1;
      const column = diagnostic.range.start.character + 1;
      const code = diagnostic.code === undefined ? "" : ` ${diagnostic.code}`;
      const source = diagnostic.source ? ` ${diagnostic.source}` : "";
      const message = diagnostic.message.replace(/\s+/g, " ").trim();
      return `${filePath}:${line}:${column} ${severityName(diagnostic.severity)}${source}${code}: ${message}`;
    })
    .join("\n");
}

async function truncateFormattedOutput(details: LspDetails): Promise<string> {
  const result = await truncateToFile(details.formatted, {
    direction: "head",
    label: "LSP diagnostics",
    outputPath: () => makeTempOutputPath("pi-lsp-", "diagnostics.txt"),
  });

  if (!result.truncated) return result.text;

  details.truncated = true;
  details.fullOutputPath = result.fullOutputPath;
  details.formatted = result.content;

  return result.text;
}

class LspServer {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private pending = new Map<
    number | string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();
  private diagnostics = new Map<string, Diagnostic[]>();
  private diagnosticWaiters = new Map<string, Array<(diagnostics: Diagnostic[]) => void>>();
  private documents = new Map<string, DocumentState>();
  private initialized = false;
  private stderr = "";

  constructor(
    readonly language: Language,
    readonly root: string,
    readonly config: ServerConfig,
  ) {
    this.proc = spawn(config.command, config.args, {
      cwd: root,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.proc.stdout.on("data", (chunk) => this.onData(chunk));
    this.proc.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString();
    });
    this.proc.on("error", (error) => {
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
    this.proc.on("close", (code) => {
      const error = new Error(
        `${this.config.command} exited with code ${code}. ${this.stderr.trim()}`.trim(),
      );
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
  }

  async ensureInitialized(timeoutMs: number): Promise<void> {
    if (this.initialized) return;

    await this.request(
      "initialize",
      {
        processId: process.pid,
        rootPath: this.root,
        rootUri: pathToUri(this.root),
        workspaceFolders: [{ uri: pathToUri(this.root), name: basename(this.root) }],
        capabilities: {
          textDocument: {
            publishDiagnostics: {
              relatedInformation: true,
              versionSupport: true,
              tagSupport: { valueSet: [1, 2] },
              codeDescriptionSupport: true,
              dataSupport: true,
            },
          },
          workspace: {
            configuration: true,
            didChangeConfiguration: { dynamicRegistration: false },
          },
          window: { workDoneProgress: true },
        },
      },
      timeoutMs,
    );
    this.notify("initialized", {});
    this.initialized = true;
  }

  async diagnose(filePath: string, content: string, timeoutMs: number): Promise<Diagnostic[]> {
    await this.ensureInitialized(timeoutMs);

    const uri = pathToUri(filePath);
    const languageId = this.config.languageId(filePath);
    const existing = this.documents.get(uri);
    const nextVersion = (existing?.version ?? 0) + 1;

    const diagnosticsPromise = this.waitForDiagnostics(uri, timeoutMs);

    if (!existing) {
      this.documents.set(uri, { version: nextVersion, languageId });
      this.notify("textDocument/didOpen", {
        textDocument: { uri, languageId, version: nextVersion, text: content },
      });
    } else {
      existing.version = nextVersion;
      this.notify("textDocument/didChange", {
        textDocument: { uri, version: nextVersion },
        contentChanges: [{ text: content }],
      });
    }

    return diagnosticsPromise;
  }

  shutdown(): void {
    void this.request("shutdown", null, SERVER_SHUTDOWN_GRACE_MS)
      .catch(() => undefined)
      .finally(() => {
        this.notify("exit", undefined);
        setTimeout(() => {
          if (!this.proc.killed) this.proc.kill("SIGTERM");
        }, SERVER_SHUTDOWN_GRACE_MS);
      });
  }

  private waitForDiagnostics(uri: string, timeoutMs: number): Promise<Diagnostic[]> {
    return new Promise((resolvePromise) => {
      let latest = this.diagnostics.get(uri) ?? [];
      let quietTimer: NodeJS.Timeout | undefined;

      const removeWaiter = () => {
        const waiters = this.diagnosticWaiters.get(uri) ?? [];
        const nextWaiters = waiters.filter((waiter) => waiter !== onPublish);
        if (nextWaiters.length === 0) this.diagnosticWaiters.delete(uri);
        else this.diagnosticWaiters.set(uri, nextWaiters);
      };

      const resolveOnce = () => {
        clearTimeout(timeoutTimer);
        if (quietTimer) clearTimeout(quietTimer);
        removeWaiter();
        resolvePromise(latest);
      };

      const timeoutTimer = setTimeout(resolveOnce, timeoutMs);

      const onPublish = (diagnostics: Diagnostic[]) => {
        latest = diagnostics;
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(
          resolveOnce,
          diagnostics.length > 0 ? NON_EMPTY_DIAGNOSTICS_QUIET_MS : EMPTY_DIAGNOSTICS_QUIET_MS,
        );
      };

      const waiters = this.diagnosticWaiters.get(uri) ?? [];
      waiters.push(onPublish);
      this.diagnosticWaiters.set(uri, waiters);
    });
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    const id = this.nextId++;
    this.send({ jsonrpc: "2.0", id, method, params });

    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectPromise(new Error(`${this.config.command} timed out waiting for ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
    });
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  private respond(id: number | string | null | undefined, result: unknown): void {
    if (id === null || id === undefined) return;
    this.send({ jsonrpc: "2.0", id, result });
  }

  private send(message: JsonRpcMessage): void {
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n`;
    this.proc.stdin.write(header + body);
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const header = this.buffer.subarray(0, headerEnd).toString("utf8");
      const contentLengthMatch = header.match(/Content-Length: (\d+)/i);
      if (!contentLengthMatch) {
        this.buffer = this.buffer.subarray(headerEnd + 4);
        continue;
      }

      const contentLength = Number(contentLengthMatch[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      if (this.buffer.length < messageEnd) return;

      const body = this.buffer.subarray(messageStart, messageEnd).toString("utf8");
      this.buffer = this.buffer.subarray(messageEnd);

      try {
        this.handleMessage(JSON.parse(body) as JsonRpcMessage);
      } catch {
        // Ignore malformed server payloads.
      }
    }
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

    if (message.method) {
      this.handleMethod(message);
    }
  }

  private handleMethod(message: JsonRpcMessage): void {
    if (message.method === "textDocument/publishDiagnostics") {
      const params = message.params as { uri?: string; diagnostics?: Diagnostic[] } | undefined;
      if (!params?.uri) return;

      const diagnostics = params.diagnostics ?? [];
      this.diagnostics.set(params.uri, diagnostics);
      const waiters = this.diagnosticWaiters.get(params.uri) ?? [];
      this.diagnosticWaiters.delete(params.uri);
      for (const waiter of waiters) waiter(diagnostics);
      return;
    }

    if (message.id === undefined || message.id === null) return;

    switch (message.method) {
      case "workspace/configuration": {
        const params = message.params as { items?: Array<{ section?: string }> } | undefined;
        this.respond(
          message.id,
          (params?.items ?? []).map((item) =>
            configurationForLanguage(this.language, item.section),
          ),
        );
        return;
      }
      case "workspace/workspaceFolders":
        this.respond(message.id, [{ uri: pathToUri(this.root), name: basename(this.root) }]);
        return;
      case "client/registerCapability":
      case "client/unregisterCapability":
      case "window/workDoneProgress/create":
      case "window/showMessageRequest":
        this.respond(message.id, null);
        return;
      default:
        this.respond(message.id, null);
    }
  }
}

export default function lsp(pi: ExtensionAPI) {
  const servers = new Map<string, LspServer>();

  function getServer(language: Language, root: string): LspServer {
    const key = `${language}:${root}`;
    const existing = servers.get(key);
    if (existing) return existing;

    const config = serverConfig(language);
    const server = new LspServer(language, root, config);
    servers.set(key, server);
    return server;
  }

  pi.registerTool({
    name: "lsp_diagnostics",
    label: "LSP Diagnostics",
    description:
      "Get diagnostics for one file using a language server. Servers are isolated by language and project root, so separate worktrees/subagents get separate LSP state. Supports TypeScript/JavaScript, Python, Rust, and Ruby when the corresponding language server is installed.",
    promptSnippet: "Run language-server diagnostics for a file.",
    promptGuidelines: [
      "Use lsp_diagnostics when the user asks for compiler/editor-style diagnostics for a specific source file.",
      "Pass cwd or root explicitly when diagnosing files in another worktree so lsp_diagnostics uses that worktree's isolated language-server state.",
    ],
    parameters: LspDiagnosticsParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const baseCwd = params.cwd ? resolve(ctx.cwd, params.cwd) : ctx.cwd;
      const filePath = await canonicalizeExistingPath(resolve(baseCwd, stripAt(params.path)));
      const language = detectLanguage(filePath, params.language ?? "auto");
      const root = await discoverRoot(
        filePath,
        language,
        params.root ? resolve(baseCwd, params.root) : undefined,
      );
      const config = serverConfig(language);
      const content = await readFile(filePath, "utf8");
      const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

      let diagnostics = await getServer(language, root).diagnose(filePath, content, timeoutMs);
      if (language === "rust" && diagnostics.length === 0) {
        diagnostics = await cargoCheckDiagnostics(pi, root, filePath, timeoutMs);
      }
      const details: LspDetails = {
        language,
        root,
        path: filePath,
        diagnostics,
        formatted: formatDiagnostics(filePath, diagnostics),
        server: [config.command, ...config.args].join(" "),
      };
      const formatted = await truncateFormattedOutput(details);

      return {
        content: [{ type: "text", text: formatted }],
        details,
      };
    },

    renderCall(args, theme) {
      let text =
        theme.fg("toolTitle", theme.bold("lsp_diagnostics ")) +
        theme.fg("accent", args.path ?? "...");
      if (args.language && args.language !== "auto") text += theme.fg("muted", ` ${args.language}`);
      if (args.root) text += theme.fg("dim", ` root=${args.root}`);
      return new Text(text, 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const details = result.details as LspDetails | undefined;
      if (!details) return new Text("No LSP details", 0, 0);

      const errors = details.diagnostics.filter((diagnostic) => diagnostic.severity === 1).length;
      const warnings = details.diagnostics.filter((diagnostic) => diagnostic.severity === 2).length;
      const others = details.diagnostics.length - errors - warnings;
      const icon =
        errors > 0
          ? theme.fg("error", "✗")
          : warnings > 0
            ? theme.fg("warning", "◐")
            : theme.fg("success", "✓");
      let text = `${icon} ${theme.fg("toolTitle", theme.bold("LSP"))} ${theme.fg("accent", details.language)} ${theme.fg(
        "muted",
        `${details.diagnostics.length} diagnostic${details.diagnostics.length === 1 ? "" : "s"}`,
      )}`;
      if (details.diagnostics.length > 0) {
        text += theme.fg("dim", ` (${errors} errors, ${warnings} warnings, ${others} other)`);
      }
      if (details.truncated && details.fullOutputPath)
        text += `\n${theme.fg("warning", `Truncated: ${details.fullOutputPath}`)}`;

      const content = result.content[0];
      if (expanded && content?.type === "text") {
        text += `\n\n${theme.fg("dim", `root: ${details.root}`)}`;
        text += `\n${theme.fg("dim", `server: ${details.server}`)}`;
        text += `\n\n${theme.fg("toolOutput", content.text)}`;
      } else if (content?.type === "text") {
        const lines = content.text.split("\n").slice(0, 8);
        text += `\n${theme.fg("toolOutput", lines.join("\n"))}`;
        if (content.text.split("\n").length > 8)
          text += `\n${theme.fg("muted", "(Ctrl+O to expand)")}`;
      }

      return new Text(text, 0, 0);
    },
  });

  pi.on("session_shutdown", () => {
    for (const server of servers.values()) server.shutdown();
    servers.clear();
  });
}
