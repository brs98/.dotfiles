import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type JsonObject = { [key: string]: any };

type ProtocolMessage = JsonObject & {
  seq?: number;
  type?: string;
  command?: string;
  event?: string;
  request_seq?: number;
  success?: boolean;
  message?: string;
  body?: any;
  method?: string;
  id?: number | string;
  params?: any;
  result?: any;
  error?: any;
};

type Pending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

function text(content: string, details: JsonObject = {}) {
  return { content: [{ type: "text" as const, text: content }], details };
}

function toolError(message: string, details: JsonObject = {}) {
  return {
    content: [{ type: "text" as const, text: message }],
    details: { ...details, success: false },
    isError: true,
  };
}

function commandExists(command: string): boolean {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [command], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function splitCommand(command: string): { command: string; args: string[] } {
  const parts = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  return {
    command: parts[0] ?? command,
    args: parts.slice(1).map((p) => p.replace(/^['"]|['"]$/g, "")),
  };
}

function normalizePath(cwd: string, file: string): string {
  const clean = file.startsWith("@") ? file.slice(1) : file;
  return isAbsolute(clean) ? resolve(clean) : resolve(cwd, clean);
}

function pathToUri(path: string): string {
  let resolved = resolve(path).replace(/\\/g, "/");
  if (!resolved.startsWith("/")) resolved = `/${resolved}`;
  return `file://${encodeURI(resolved).replace(/%3A/g, ":")}`;
}

function uriToPath(uri: string): string {
  if (!uri.startsWith("file://")) return uri;
  let p = decodeURI(uri.slice("file://".length));
  if (process.platform === "win32" && /^\/[A-Za-z]:/.test(p)) p = p.slice(1);
  return p;
}

function lineOffsets(textValue: string): number[] {
  const offsets = [0];
  for (let i = 0; i < textValue.length; i++) if (textValue[i] === "\n") offsets.push(i + 1);
  return offsets;
}

function offsetAt(textValue: string, position: { line: number; character: number }): number {
  const offsets = lineOffsets(textValue);
  const line = Math.max(0, Math.min(position.line, offsets.length - 1));
  const lineStart = offsets[line];
  const nextLine = line + 1 < offsets.length ? offsets[line + 1] : textValue.length;
  return Math.max(lineStart, Math.min(lineStart + position.character, nextLine));
}

function applyTextEdits(source: string, edits: Array<{ range: any; newText: string }>): string {
  const sorted = [...edits].sort(
    (a, b) => offsetAt(source, b.range.start) - offsetAt(source, a.range.start),
  );
  let out = source;
  for (const edit of sorted) {
    const start = offsetAt(out, edit.range.start);
    const end = offsetAt(out, edit.range.end);
    out = out.slice(0, start) + edit.newText + out.slice(end);
  }
  return out;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatLocation(loc: any): string {
  const uri = loc.uri ?? loc.targetUri;
  const range = loc.range ?? loc.targetSelectionRange ?? loc.targetRange;
  const p = uri ? uriToPath(uri) : "<unknown>";
  const line = range?.start?.line != null ? range.start.line + 1 : "?";
  const col = range?.start?.character != null ? range.start.character + 1 : "?";
  return `${p}:${line}:${col}`;
}

function flattenLocations(result: any): any[] {
  if (!result) return [];
  return Array.isArray(result) ? result : [result];
}

function formatMarkup(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(formatMarkup).filter(Boolean).join("\n");
  if (typeof value.value === "string") return value.value;
  if (typeof value.contents !== "undefined") return formatMarkup(value.contents);
  if (typeof value.language === "string" && typeof value.value === "string")
    return `\`\`\`${value.language}\n${value.value}\n\`\`\``;
  return formatJson(value);
}

function getRepoRoot(cwd: string): string {
  const git = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (git.status === 0 && git.stdout.trim()) return git.stdout.trim();
  return cwd;
}

const languageByExt: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".rb": "ruby",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".lua": "lua",
  ".sh": "shellscript",
  ".bash": "shellscript",
  ".zsh": "shellscript",
  ".fish": "shellscript",
  ".json": "json",
  ".jsonc": "jsonc",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".md": "markdown",
};

type LspServerDef = {
  name: string;
  command: string;
  args: string[];
  extensions: string[];
  rootMarkers?: string[];
};

const DEFAULT_LSP_SERVERS: LspServerDef[] = [
  {
    name: "typescript-language-server",
    command: "typescript-language-server",
    args: ["--stdio"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    rootMarkers: ["package.json", "tsconfig.json", "jsconfig.json"],
  },
  {
    name: "pyright",
    command: "pyright-langserver",
    args: ["--stdio"],
    extensions: [".py"],
    rootMarkers: ["pyproject.toml", "setup.py", "requirements.txt"],
  },
  {
    name: "pylsp",
    command: "pylsp",
    args: [],
    extensions: [".py"],
    rootMarkers: ["pyproject.toml", "setup.py", "requirements.txt"],
  },
  {
    name: "rust-analyzer",
    command: "rust-analyzer",
    args: [],
    extensions: [".rs"],
    rootMarkers: ["Cargo.toml"],
  },
  {
    name: "gopls",
    command: "gopls",
    args: [],
    extensions: [".go"],
    rootMarkers: ["go.mod", "go.work"],
  },
  {
    name: "clangd",
    command: "clangd",
    args: [],
    extensions: [".c", ".h", ".cpp", ".cc", ".cxx", ".hpp"],
    rootMarkers: ["compile_commands.json", "compile_flags.txt"],
  },
  {
    name: "ruby-lsp",
    command: "ruby-lsp",
    args: [],
    extensions: [".rb"],
    rootMarkers: ["Gemfile", ".ruby-version"],
  },
  {
    name: "solargraph",
    command: "solargraph",
    args: ["stdio"],
    extensions: [".rb"],
    rootMarkers: ["Gemfile", ".ruby-version"],
  },
  {
    name: "bash-language-server",
    command: "bash-language-server",
    args: ["start"],
    extensions: [".sh", ".bash", ".zsh"],
  },
  {
    name: "vscode-json-language-server",
    command: "vscode-json-language-server",
    args: ["--stdio"],
    extensions: [".json", ".jsonc"],
  },
  {
    name: "yaml-language-server",
    command: "yaml-language-server",
    args: ["--stdio"],
    extensions: [".yaml", ".yml"],
  },
  {
    name: "vscode-html-language-server",
    command: "vscode-html-language-server",
    args: ["--stdio"],
    extensions: [".html"],
  },
  {
    name: "vscode-css-language-server",
    command: "vscode-css-language-server",
    args: ["--stdio"],
    extensions: [".css", ".scss"],
  },
  { name: "lua-language-server", command: "lua-language-server", args: [], extensions: [".lua"] },
  {
    name: "jdtls",
    command: "jdtls",
    args: [],
    extensions: [".java"],
    rootMarkers: ["pom.xml", "build.gradle", "settings.gradle"],
  },
];

function chooseLspServer(
  file: string,
  explicit?: { command?: string; args?: string[]; name?: string },
): LspServerDef | undefined {
  if (explicit?.command)
    return {
      name: explicit.name ?? explicit.command,
      command: explicit.command,
      args: explicit.args ?? [],
      extensions: [],
    };
  const ext = extname(file).toLowerCase();
  return DEFAULT_LSP_SERVERS.find((s) => s.extensions.includes(ext) && commandExists(s.command));
}

function resolvePosition(
  file: string,
  line?: number,
  character?: number,
  symbol?: string,
): { line: number; character: number } {
  const content = readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  const zeroLine = Math.max(0, Math.min((line ?? 1) - 1, Math.max(0, lines.length - 1)));
  if (character != null) return { line: zeroLine, character: Math.max(0, character - 1) };
  const lineText = lines[zeroLine] ?? "";
  if (symbol) {
    const match = symbol.match(/^(.*)#(\d+)$/);
    const needle = match ? match[1] : symbol;
    const occurrence = match ? Number(match[2]) : 1;
    let index = -1;
    let from = 0;
    for (let i = 0; i < occurrence; i++) {
      index = lineText.indexOf(needle, from);
      if (index === -1) break;
      from = index + needle.length;
    }
    if (index !== -1) return { line: zeroLine, character: index };
    const lower = lineText.toLowerCase().indexOf(needle.toLowerCase());
    if (lower !== -1) return { line: zeroLine, character: lower };
  }
  const first = lineText.search(/\S/);
  return { line: zeroLine, character: first >= 0 ? first : 0 };
}

class JsonRpcProcess {
  protected child: ChildProcessWithoutNullStreams;
  protected seq = 1;
  protected pending = new Map<number | string, Pending>();
  protected buffer = Buffer.alloc(0);
  protected closed = false;
  readonly stderr: string[] = [];

  constructor(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = process.env) {
    this.child = spawn(command, args, { cwd, env: { ...env }, stdio: "pipe" });
    this.child.stdout.on("data", (chunk) => this.onData(chunk));
    this.child.stderr.on("data", (chunk) => {
      const s = chunk.toString();
      this.stderr.push(s);
      if (this.stderr.join("").length > 20_000) this.stderr.splice(0, this.stderr.length - 20);
    });
    this.child.on("exit", (code, signal) => {
      this.closed = true;
      const err = new Error(`process exited (${code ?? signal ?? "unknown"})`);
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(err);
      }
      this.pending.clear();
    });
  }

  protected nextId(): number {
    return this.seq++;
  }

  protected sendRaw(message: JsonObject) {
    if (this.closed) throw new Error("protocol process is closed");
    const body = JSON.stringify(message);
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }

  protected onData(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.buffer.slice(0, headerEnd).toString("utf8");
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) return;
      const raw = this.buffer.slice(bodyStart, bodyStart + length).toString("utf8");
      this.buffer = this.buffer.slice(bodyStart + length);
      try {
        this.handleMessage(JSON.parse(raw));
      } catch {
        // Ignore malformed protocol frames from adapters/servers.
      }
    }
  }

  protected handleMessage(_message: ProtocolMessage) {}

  dispose() {
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("disposed"));
    }
    this.pending.clear();
    this.child.kill();
  }
}

class LspClient extends JsonRpcProcess {
  readonly root: string;
  readonly server: LspServerDef;
  capabilities: any = {};
  diagnostics = new Map<string, any[]>();
  opened = new Set<string>();
  versions = new Map<string, number>();
  private initialized = false;

  constructor(server: LspServerDef, root: string) {
    super(server.command, server.args, root);
    this.root = root;
    this.server = server;
  }

  async initialize(timeout = 20_000) {
    if (this.initialized) return;
    const result = await this.request(
      "initialize",
      {
        processId: process.pid,
        rootPath: this.root,
        rootUri: pathToUri(this.root),
        workspaceFolders: [
          { uri: pathToUri(this.root), name: this.root.split(/[\\/]/).pop() ?? this.root },
        ],
        capabilities: {
          workspace: {
            applyEdit: true,
            workspaceEdit: {
              documentChanges: true,
              resourceOperations: ["create", "rename", "delete"],
            },
            configuration: true,
            didChangeConfiguration: { dynamicRegistration: true },
            symbol: { dynamicRegistration: false },
          },
          textDocument: {
            synchronization: { didSave: true, willSave: false, willSaveWaitUntil: false },
            definition: { dynamicRegistration: false, linkSupport: true },
            typeDefinition: { dynamicRegistration: false, linkSupport: true },
            implementation: { dynamicRegistration: false, linkSupport: true },
            references: { dynamicRegistration: false },
            hover: { dynamicRegistration: false, contentFormat: ["markdown", "plaintext"] },
            documentSymbol: { dynamicRegistration: false, hierarchicalDocumentSymbolSupport: true },
            rename: { dynamicRegistration: false, prepareSupport: true },
            codeAction: {
              dynamicRegistration: false,
              codeActionLiteralSupport: {
                codeActionKind: {
                  valueSet: ["", "quickfix", "refactor", "source", "source.organizeImports"],
                },
              },
              isPreferredSupport: true,
              resolveSupport: { properties: ["edit", "command"] },
            },
            formatting: { dynamicRegistration: false },
            rangeFormatting: { dynamicRegistration: false },
            publishDiagnostics: { relatedInformation: true, versionSupport: true },
          },
        },
      },
      timeout,
    );
    this.capabilities = result?.capabilities ?? {};
    this.notify("initialized", {});
    this.initialized = true;
  }

  request(method: string, params?: any, timeout = 20_000): Promise<any> {
    const id = this.nextId();
    this.sendRaw({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`LSP request timed out: ${method}`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  notify(method: string, params?: any) {
    this.sendRaw({ jsonrpc: "2.0", method, params });
  }

  protected handleMessage(message: ProtocolMessage) {
    if (Object.prototype.hasOwnProperty.call(message, "id") && !message.method) {
      const pending = this.pending.get(message.id!);
      if (!pending) return;
      this.pending.delete(message.id!);
      clearTimeout(pending.timer);
      if (message.error)
        pending.reject(new Error(message.error.message ?? formatJson(message.error)));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === "textDocument/publishDiagnostics") {
      this.diagnostics.set(message.params?.uri, message.params?.diagnostics ?? []);
      return;
    }
    if (Object.prototype.hasOwnProperty.call(message, "id") && message.method) {
      let result: any = null;
      if (message.method === "workspace/configuration")
        result = (message.params?.items ?? []).map(() => ({}));
      if (message.method === "workspace/workspaceFolders")
        result = [{ uri: pathToUri(this.root), name: this.root.split(/[\\/]/).pop() ?? this.root }];
      this.sendRaw({ jsonrpc: "2.0", id: message.id, result });
    }
  }

  openFile(file: string) {
    const uri = pathToUri(file);
    const languageId = languageByExt[extname(file).toLowerCase()] ?? "plaintext";
    const content = readFileSync(file, "utf8");
    if (this.opened.has(uri)) {
      const version = (this.versions.get(uri) ?? 1) + 1;
      this.versions.set(uri, version);
      this.notify("textDocument/didChange", {
        textDocument: { uri, version },
        contentChanges: [{ text: content }],
      });
      return;
    }
    this.opened.add(uri);
    this.versions.set(uri, 1);
    this.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version: 1, text: content },
    });
  }

  async waitForDiagnostics(uri: string, timeoutMs: number): Promise<any[]> {
    const start = Date.now();
    let firstEmptyAt: number | undefined;
    const emptySettleMs = Math.min(5000, Math.max(1000, Math.floor(timeoutMs / 3)));
    while (Date.now() - start < timeoutMs) {
      if (this.diagnostics.has(uri)) {
        const current = this.diagnostics.get(uri) ?? [];
        if (current.length > 0) return current;
        firstEmptyAt ??= Date.now();
        if (Date.now() - firstEmptyAt >= emptySettleMs) return current;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return this.diagnostics.get(uri) ?? [];
  }

  async applyWorkspaceEdit(edit: any): Promise<string[]> {
    const changes: string[] = [];
    const editsByUri = new Map<string, Array<{ range: any; newText: string }>>();
    function add(uri: string, edits: any[]) {
      const current = editsByUri.get(uri) ?? [];
      current.push(...edits.filter((e) => e?.range && typeof e.newText === "string"));
      editsByUri.set(uri, current);
    }
    if (edit?.changes) {
      for (const [uri, edits] of Object.entries(edit.changes)) add(uri, edits as any[]);
    }
    if (Array.isArray(edit?.documentChanges)) {
      for (const change of edit.documentChanges) {
        if (change?.textDocument?.uri && Array.isArray(change.edits))
          add(change.textDocument.uri, change.edits);
        else if (change?.kind === "rename" && change.oldUri && change.newUri) {
          renameSync(uriToPath(change.oldUri), uriToPath(change.newUri));
          changes.push(`renamed ${uriToPath(change.oldUri)} -> ${uriToPath(change.newUri)}`);
        } else if (change?.kind === "create" && change.uri) {
          const p = uriToPath(change.uri);
          mkdirSync(dirname(p), { recursive: true });
          if (!existsSync(p)) writeFileSync(p, "");
          changes.push(`created ${p}`);
        } else if (change?.kind === "delete" && change.uri) {
          rmSync(uriToPath(change.uri), { force: true, recursive: true });
          changes.push(`deleted ${uriToPath(change.uri)}`);
        }
      }
    }
    for (const [uri, edits] of editsByUri) {
      const p = uriToPath(uri);
      const before = existsSync(p) ? readFileSync(p, "utf8") : "";
      const after = applyTextEdits(before, edits);
      if (after !== before) writeFileSync(p, after);
      changes.push(`${p}: ${edits.length} text edit(s)`);
    }
    return changes;
  }
}

const lspClients = new Map<string, LspClient>();

async function getLspClient(ctx: ExtensionContext, file: string, params: any): Promise<LspClient> {
  const root = params.root ? normalizePath(ctx.cwd, params.root) : getRepoRoot(dirname(file));
  const server = chooseLspServer(file, {
    command: params.server_command,
    args: params.server_args,
    name: params.server_name,
  });
  if (!server)
    throw new Error(
      `No installed language server found for ${extname(file) || file}. Pass server_command/server_args or install a matching server.`,
    );
  const key = `${root}\0${server.name}\0${server.command} ${server.args.join(" ")}`;
  let client = lspClients.get(key);
  if (!client) {
    client = new LspClient(server, root);
    lspClients.set(key, client);
    await client.initialize((params.timeout ?? 20) * 1000);
  }
  return client;
}

function formatDiagnostics(diags: any[], uri: string): string {
  if (diags.length === 0) return `OK: ${uriToPath(uri)}`;
  return diags
    .map((d) => {
      const sev = ["", "error", "warning", "info", "hint"][d.severity ?? 0] ?? "diagnostic";
      const line = (d.range?.start?.line ?? 0) + 1;
      const col = (d.range?.start?.character ?? 0) + 1;
      const source = d.source ? ` [${d.source}]` : "";
      const code = d.code != null ? ` ${d.code}` : "";
      return `${uriToPath(uri)}:${line}:${col}: ${sev}${source}${code}: ${d.message}`;
    })
    .join("\n");
}

async function runLsp(ctx: ExtensionContext, params: any) {
  const action = params.action;
  if (action === "status") {
    const active = [...lspClients.values()].map((c) => `${c.server.name} @ ${c.root}`).join("\n");
    const available = DEFAULT_LSP_SERVERS.filter((s) => commandExists(s.command))
      .map((s) => `${s.name} (${s.command})`)
      .join("\n");
    return text(
      `Active LSP clients:\n${active || "(none)"}\n\nInstalled known servers:\n${available || "(none found)"}`,
      { action, success: true },
    );
  }
  if (action === "reload") {
    for (const c of lspClients.values()) c.dispose();
    lspClients.clear();
    return text("LSP clients disposed. They will restart on the next request.", {
      action,
      success: true,
    });
  }
  if (action === "workspace_symbols") {
    const fakeFile = params.file ? normalizePath(ctx.cwd, params.file) : join(ctx.cwd, "index.ts");
    const client = await getLspClient(ctx, fakeFile, params);
    const result = await client.request(
      "workspace/symbol",
      { query: params.query ?? "" },
      (params.timeout ?? 20) * 1000,
    );
    const symbols = Array.isArray(result) ? result : [];
    return text(
      symbols
        .slice(0, params.limit ?? 100)
        .map((s) => `${s.name} (${s.kind}) ${formatLocation(s.location ?? s)}`)
        .join("\n") || "No workspace symbols found",
      { action, success: true, count: symbols.length, raw: result },
    );
  }

  if (!params.file) return toolError(`lsp action '${action}' requires file`, { action });
  const file = normalizePath(ctx.cwd, params.file);
  if (!existsSync(file) && action !== "rename_file")
    return toolError(`File not found: ${file}`, { action });
  const client = await getLspClient(ctx, file, params);
  await client.initialize((params.timeout ?? 20) * 1000);
  const uri = pathToUri(file);
  if (existsSync(file)) client.openFile(file);
  const timeout = (params.timeout ?? 20) * 1000;
  const position = existsSync(file)
    ? resolvePosition(file, params.line, params.character, params.symbol)
    : { line: 0, character: 0 };

  if (action === "diagnostics") {
    const diagnostics = await client.waitForDiagnostics(uri, timeout);
    return text(formatDiagnostics(diagnostics, uri), { action, success: true, diagnostics });
  }
  if (["definition", "type_definition", "implementation", "references"].includes(action)) {
    const method: Record<string, string> = {
      definition: "textDocument/definition",
      type_definition: "textDocument/typeDefinition",
      implementation: "textDocument/implementation",
      references: "textDocument/references",
    };
    const requestParams: any = { textDocument: { uri }, position };
    if (action === "references")
      requestParams.context = { includeDeclaration: params.include_declaration !== false };
    const result = await client.request(method[action], requestParams, timeout);
    const locs = flattenLocations(result);
    return text(
      locs.length ? locs.map(formatLocation).join("\n") : `No ${action.replace("_", " ")} found`,
      { action, success: true, raw: result },
    );
  }
  if (action === "hover") {
    const result = await client.request(
      "textDocument/hover",
      { textDocument: { uri }, position },
      timeout,
    );
    return text(formatMarkup(result?.contents) || "No hover information", {
      action,
      success: true,
      raw: result,
    });
  }
  if (action === "symbols") {
    const result = await client.request(
      "textDocument/documentSymbol",
      { textDocument: { uri } },
      timeout,
    );
    const lines: string[] = [];
    function walk(items: any[], depth = 0) {
      for (const item of items ?? []) {
        const range = item.selectionRange ?? item.location?.range;
        lines.push(
          `${"  ".repeat(depth)}${item.name ?? "<unnamed>"} (${item.kind ?? "?"}) line ${(range?.start?.line ?? 0) + 1}`,
        );
        if (item.children) walk(item.children, depth + 1);
      }
    }
    walk(Array.isArray(result) ? result : []);
    return text(lines.join("\n") || "No document symbols found", {
      action,
      success: true,
      raw: result,
    });
  }
  if (action === "rename") {
    if (!params.new_name) return toolError("rename requires new_name", { action });
    const edit = await client.request(
      "textDocument/rename",
      { textDocument: { uri }, position, newName: params.new_name },
      timeout,
    );
    if (params.apply === false)
      return text(`Rename preview:\n${formatJson(edit)}`, {
        action,
        success: true,
        edit,
        applied: false,
      });
    const changes = await client.applyWorkspaceEdit(edit);
    return text(
      changes.length ? `Applied rename:\n${changes.join("\n")}` : "Rename returned no edits",
      { action, success: true, edit, changes },
    );
  }
  if (action === "rename_file") {
    if (!params.new_name) return toolError("rename_file requires new_name", { action });
    const newPath = normalizePath(ctx.cwd, params.new_name);
    const oldUri = uri;
    const newUri = pathToUri(newPath);
    let edit: any = null;
    try {
      edit = await client.request(
        "workspace/willRenameFiles",
        { files: [{ oldUri, newUri }] },
        timeout,
      );
    } catch {
      edit = null;
    }
    if (params.apply === false)
      return text(`Rename-file preview ${file} -> ${newPath}:\n${formatJson(edit)}`, {
        action,
        success: true,
        edit,
        applied: false,
      });
    const changes = edit ? await client.applyWorkspaceEdit(edit) : [];
    mkdirSync(dirname(newPath), { recursive: true });
    renameSync(file, newPath);
    client.notify("workspace/didRenameFiles", { files: [{ oldUri, newUri }] });
    return text([`renamed ${file} -> ${newPath}`, ...changes].join("\n"), {
      action,
      success: true,
      edit,
      changes,
    });
  }
  if (action === "code_actions") {
    const diagnostics = client.diagnostics.get(uri) ?? [];
    const range = params.range
      ? {
          start: {
            line: params.range.start_line - 1,
            character: params.range.start_character ?? 0,
          },
          end: { line: params.range.end_line - 1, character: params.range.end_character ?? 9999 },
        }
      : { start: position, end: position };
    let actions = await client.request(
      "textDocument/codeAction",
      {
        textDocument: { uri },
        range,
        context: { diagnostics, only: params.kind ? [params.kind] : undefined },
      },
      timeout,
    );
    actions = Array.isArray(actions) ? actions : [];
    if (!params.apply) {
      return text(
        actions
          .map(
            (a: any, i: number) => `${i}: [${a.kind ?? ""}] ${a.title ?? a.command ?? "<unnamed>"}`,
          )
          .join("\n") || "No code actions",
        { action, success: true, actions },
      );
    }
    const selector = String(params.query ?? "0");
    let selected = /^\d+$/.test(selector)
      ? actions[Number(selector)]
      : actions.find((a: any) =>
          String(a.title ?? a.command ?? "")
            .toLowerCase()
            .includes(selector.toLowerCase()),
        );
    if (!selected) return toolError(`No code action matches ${selector}`, { action, actions });
    if (selected.data && !selected.edit && client.capabilities?.codeActionProvider?.resolveProvider)
      selected = await client.request("codeAction/resolve", selected, timeout);
    const changes = selected.edit ? await client.applyWorkspaceEdit(selected.edit) : [];
    if (selected.command)
      await client.request(
        "workspace/executeCommand",
        typeof selected.command === "string"
          ? { command: selected.command, arguments: selected.arguments ?? [] }
          : selected.command,
        timeout,
      );
    return text(
      `Applied code action: ${selected.title ?? selected.command}\n${changes.join("\n") || "(no workspace edits)"}`,
      { action, success: true, selected, changes },
    );
  }
  if (action === "format") {
    const method = params.range ? "textDocument/rangeFormatting" : "textDocument/formatting";
    const requestParams: any = {
      textDocument: { uri },
      options: { tabSize: params.tab_size ?? 2, insertSpaces: params.insert_spaces !== false },
    };
    if (params.range)
      requestParams.range = {
        start: { line: params.range.start_line - 1, character: params.range.start_character ?? 0 },
        end: { line: params.range.end_line - 1, character: params.range.end_character ?? 9999 },
      };
    const edits = (await client.request(method, requestParams, timeout)) ?? [];
    if (params.apply === false)
      return text(`Format preview:\n${formatJson(edits)}`, {
        action,
        success: true,
        edits,
        applied: false,
      });
    const before = readFileSync(file, "utf8");
    const after = applyTextEdits(before, edits);
    if (after !== before) writeFileSync(file, after);
    return text(
      edits.length ? `Formatted ${file}: ${edits.length} edit(s)` : "No formatting edits",
      { action, success: true, edits },
    );
  }
  if (action === "request") {
    if (!params.method) return toolError("request requires method", { action });
    const payload =
      typeof params.payload === "string" ? JSON.parse(params.payload) : (params.payload ?? {});
    const result = await client.request(params.method, payload, timeout);
    return text(formatJson(result), { action, success: true, result });
  }
  return toolError(`Unknown lsp action: ${action}`, { action });
}

type DapSession = {
  id: string;
  adapter: string;
  client: DapClient;
  breakpoints: Map<string, Set<number>>;
  functionBreakpoints: Map<string, any>;
  instructionBreakpoints: Map<string, any>;
  dataBreakpoints: Map<string, any>;
  currentThreadId?: number;
  currentFrameId?: number;
};

class DapClient extends JsonRpcProcess {
  private requestSeq = 1;
  output: string[] = [];
  events: ProtocolMessage[] = [];
  capabilities: any = {};

  request(command: string, args?: any, timeout = 30_000): Promise<any> {
    const seq = this.requestSeq++;
    this.sendRaw({ seq, type: "request", command, arguments: args ?? {} });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`DAP request timed out: ${command}`));
      }, timeout);
      this.pending.set(seq, { resolve, reject, timer });
    });
  }

  protected handleMessage(message: ProtocolMessage) {
    if (message.type === "request") {
      if (message.command === "runInTerminal") {
        try {
          const args = message.body?.args ?? [];
          const command = args[0];
          const commandArgs = args.slice(1);
          const cwd = message.body?.cwd;
          const child = spawn(command, commandArgs, {
            cwd,
            env: { ...process.env, ...message.body?.env },
            detached: true,
            stdio: "ignore",
          });
          child.unref();
          this.sendRaw({
            seq: this.requestSeq++,
            type: "response",
            request_seq: message.seq,
            command: message.command,
            success: true,
            body: { processId: child.pid },
          });
        } catch (error: any) {
          this.sendRaw({
            seq: this.requestSeq++,
            type: "response",
            request_seq: message.seq,
            command: message.command,
            success: false,
            message: error?.message ?? String(error),
          });
        }
      } else {
        this.sendRaw({
          seq: this.requestSeq++,
          type: "response",
          request_seq: message.seq,
          command: message.command,
          success: false,
          message: `Unsupported reverse request: ${message.command}`,
        });
      }
      return;
    }
    if (message.type === "response" && message.request_seq != null) {
      const pending = this.pending.get(message.request_seq);
      if (!pending) return;
      this.pending.delete(message.request_seq);
      clearTimeout(pending.timer);
      if (message.success === false)
        pending.reject(new Error(message.message ?? formatJson(message.body ?? message)));
      else pending.resolve(message.body ?? {});
      return;
    }
    if (message.type === "event") {
      this.events.push(message);
      if (this.events.length > 500) this.events.shift();
      if (message.event === "output") {
        const out = message.body?.output ?? "";
        this.output.push(out);
        if (this.output.join("").length > 200_000)
          this.output.splice(0, Math.max(1, this.output.length - 100));
      }
    }
  }

  async waitForEvent(event: string, timeoutMs = 3000): Promise<ProtocolMessage | undefined> {
    const existing = this.events.find((e) => e.event === event);
    if (existing) return existing;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = this.events.find((e) => e.event === event);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 50));
    }
    return undefined;
  }
}

const dapSessions = new Map<string, DapSession>();

function resolveAdapter(params: any): { name: string; command: string; args: string[] } {
  if (params.adapter_command) {
    const split = splitCommand(params.adapter_command);
    return {
      name: params.adapter ?? split.command,
      command: split.command,
      args: [...split.args, ...(params.adapter_args ?? [])],
    };
  }
  const adapter = params.adapter ?? inferAdapter(params.program ?? "");
  if (adapter === "python" || adapter === "debugpy")
    return { name: "debugpy", command: "python3", args: ["-m", "debugpy.adapter"] };
  if (adapter === "lldb" || adapter === "lldb-dap")
    return { name: "lldb-dap", command: "lldb-dap", args: [] };
  if (adapter === "node" && commandExists("js-debug-adapter"))
    return { name: "js-debug-adapter", command: "js-debug-adapter", args: [] };
  throw new Error(
    `No DAP adapter found. Pass adapter_command, or install one of: python3 debugpy, lldb-dap, js-debug-adapter.`,
  );
}

function inferAdapter(program: string): string {
  const ext = extname(program).toLowerCase();
  if (ext === ".py") return "python";
  if ([".js", ".mjs", ".cjs", ".ts"].includes(ext)) return "node";
  return "lldb-dap";
}

async function createDapSession(ctx: ExtensionContext, params: any): Promise<DapSession> {
  const id = params.session ?? "default";
  const adapter = resolveAdapter(params);
  if (!commandExists(adapter.command))
    throw new Error(`DAP adapter command not found: ${adapter.command}`);
  const cwd = params.cwd ? normalizePath(ctx.cwd, params.cwd) : ctx.cwd;
  const client = new DapClient(adapter.command, adapter.args, cwd);
  const init = await client.request(
    "initialize",
    {
      clientID: "pi-lsp-dap-tools",
      clientName: "Pi LSP/DAP Tools",
      adapterID: adapter.name,
      pathFormat: "path",
      linesStartAt1: true,
      columnsStartAt1: true,
      supportsVariableType: true,
      supportsVariablePaging: true,
      supportsRunInTerminalRequest: false,
    },
    (params.timeout ?? 30) * 1000,
  );
  client.capabilities = init;
  const session: DapSession = {
    id,
    adapter: adapter.name,
    client,
    breakpoints: new Map(),
    functionBreakpoints: new Map(),
    instructionBreakpoints: new Map(),
    dataBreakpoints: new Map(),
  };
  dapSessions.set(id, session);
  return session;
}

function getDapSession(params: any): DapSession {
  const id = params.session ?? "default";
  const session = dapSessions.get(id);
  if (!session)
    throw new Error(`No DAP session '${id}'. Start one with debug action launch or attach.`);
  return session;
}

function formatStack(frames: any[]): string {
  return frames
    .map((f) => `${f.id}: ${f.name} ${f.source?.path ?? ""}:${f.line ?? "?"}:${f.column ?? "?"}`)
    .join("\n");
}

async function runDebug(ctx: ExtensionContext, params: any) {
  const action = params.action;
  const timeout = (params.timeout ?? 30) * 1000;
  if (action === "sessions") {
    const lines = [...dapSessions.values()].map(
      (s) =>
        `${s.id}: ${s.adapter} events=${s.client.events.length} breakpoints=${[...s.breakpoints.values()].reduce((n, set) => n + set.size, 0)}`,
    );
    return text(lines.join("\n") || "No DAP sessions", { action, success: true });
  }
  if (action === "launch" || action === "attach") {
    const existing = dapSessions.get(params.session ?? "default");
    if (existing) existing.client.dispose();
    const session = await createDapSession(ctx, params);
    const cwd = params.cwd ? normalizePath(ctx.cwd, params.cwd) : ctx.cwd;
    let args: any;
    if (action === "launch") {
      if (!params.program) return toolError("launch requires program", { action });
      const program = normalizePath(ctx.cwd, params.program);
      args = {
        name: params.name ?? program.split(/[\\/]/).pop(),
        type: params.adapter ?? inferAdapter(program),
        request: "launch",
        program,
        cwd,
        args: params.args ?? [],
        stopOnEntry: params.stop_on_entry ?? false,
        console: params.console ?? "internalConsole",
        ...params.configuration,
      };
    } else {
      args = {
        name: params.name ?? "attach",
        type: params.adapter ?? "debug",
        request: "attach",
        processId: params.pid,
        pid: params.pid,
        port: params.port,
        host: params.host ?? "127.0.0.1",
        cwd,
        ...params.configuration,
      };
    }
    await session.client.request(action, args, timeout);
    await session.client.waitForEvent("initialized", 2000);
    if (Array.isArray(params.breakpoints)) {
      for (const bp of params.breakpoints) {
        const file = normalizePath(ctx.cwd, bp.file);
        const set = session.breakpoints.get(file) ?? new Set<number>();
        set.add(Number(bp.line));
        session.breakpoints.set(file, set);
        await session.client.request(
          "setBreakpoints",
          {
            source: { path: file },
            breakpoints: [...set].sort((a, b) => a - b).map((line) => ({ line })),
          },
          timeout,
        );
      }
    }
    try {
      await session.client.request("configurationDone", {}, 5000);
    } catch {}
    const stopped = await session.client.waitForEvent(
      "stopped",
      params.stop_on_entry ? timeout : 1000,
    );
    if (stopped?.body?.threadId) session.currentThreadId = stopped.body.threadId;
    return text(
      `${action} started session '${session.id}' with ${session.adapter}${stopped ? `\nstopped: ${formatJson(stopped.body)}` : ""}`,
      {
        action,
        success: true,
        session: session.id,
        adapter: session.adapter,
        capabilities: session.client.capabilities,
      },
    );
  }
  const session = getDapSession(params);
  const client = session.client;
  if (action === "set_breakpoint" || action === "remove_breakpoint") {
    if (!params.file || !params.line)
      return toolError(`${action} requires file and line`, { action });
    const file = normalizePath(ctx.cwd, params.file);
    const set = session.breakpoints.get(file) ?? new Set<number>();
    if (action === "set_breakpoint") set.add(Number(params.line));
    else set.delete(Number(params.line));
    session.breakpoints.set(file, set);
    const body = await client.request(
      "setBreakpoints",
      {
        source: { path: file },
        breakpoints: [...set]
          .sort((a, b) => a - b)
          .map((line) => ({
            line,
            condition: params.condition,
            hitCondition: params.hit_condition,
          })),
      },
      timeout,
    );
    return text(`${file}: ${[...set].sort((a, b) => a - b).join(", ") || "no breakpoints"}`, {
      action,
      success: true,
      breakpoints: body.breakpoints,
    });
  }
  if (action === "set_function_breakpoint" || action === "remove_function_breakpoint") {
    if (!params.function) return toolError(`${action} requires function`, { action });
    if (action === "set_function_breakpoint")
      session.functionBreakpoints.set(params.function, {
        name: params.function,
        condition: params.condition,
        hitCondition: params.hit_condition,
      });
    else session.functionBreakpoints.delete(params.function);
    const body = await client.request(
      "setFunctionBreakpoints",
      { breakpoints: [...session.functionBreakpoints.values()] },
      timeout,
    );
    return text(
      `${[...session.functionBreakpoints.keys()].join(", ") || "no function breakpoints"}`,
      { action, success: true, breakpoints: body.breakpoints },
    );
  }
  if (action === "set_instruction_breakpoint" || action === "remove_instruction_breakpoint") {
    if (!params.instruction_reference)
      return toolError(`${action} requires instruction_reference`, { action });
    if (action === "set_instruction_breakpoint")
      session.instructionBreakpoints.set(params.instruction_reference, {
        instructionReference: params.instruction_reference,
        offset: params.offset,
        condition: params.condition,
        hitCondition: params.hit_condition,
      });
    else session.instructionBreakpoints.delete(params.instruction_reference);
    const body = await client.request(
      "setInstructionBreakpoints",
      { breakpoints: [...session.instructionBreakpoints.values()] },
      timeout,
    );
    return text(
      `${[...session.instructionBreakpoints.keys()].join(", ") || "no instruction breakpoints"}`,
      { action, success: true, breakpoints: body.breakpoints },
    );
  }
  if (action === "data_breakpoint_info") {
    if (!params.name) return toolError("data_breakpoint_info requires name", { action });
    const body = await client.request(
      "dataBreakpointInfo",
      {
        name: params.name,
        variablesReference: params.variables_reference ?? params.scope_id,
        frameId: params.frame_id ?? session.currentFrameId,
      },
      timeout,
    );
    return text(formatJson(body), { action, success: true, dataBreakpointInfo: body });
  }
  if (action === "set_data_breakpoint" || action === "remove_data_breakpoint") {
    if (!params.data_id) return toolError(`${action} requires data_id`, { action });
    if (action === "set_data_breakpoint")
      session.dataBreakpoints.set(params.data_id, {
        dataId: params.data_id,
        accessType: params.access_type,
        condition: params.condition,
        hitCondition: params.hit_condition,
      });
    else session.dataBreakpoints.delete(params.data_id);
    const body = await client.request(
      "setDataBreakpoints",
      { breakpoints: [...session.dataBreakpoints.values()] },
      timeout,
    );
    return text(`${[...session.dataBreakpoints.keys()].join(", ") || "no data breakpoints"}`, {
      action,
      success: true,
      breakpoints: body.breakpoints,
    });
  }
  if (["continue", "step_over", "step_in", "step_out", "pause"].includes(action)) {
    const command: Record<string, string> = {
      continue: "continue",
      step_over: "next",
      step_in: "stepIn",
      step_out: "stepOut",
      pause: "pause",
    };
    const threadId = params.thread_id ?? session.currentThreadId;
    if (!threadId)
      return toolError(`${action} requires thread_id (or a currently stopped thread)`, { action });
    const body = await client.request(command[action], { threadId }, timeout);
    const stopped = ["continue", "step_over", "step_in", "step_out", "pause"].includes(action)
      ? await client.waitForEvent("stopped", Math.min(timeout, 5000))
      : undefined;
    if (stopped?.body?.threadId) session.currentThreadId = stopped.body.threadId;
    return text(`${action} sent${stopped ? `\nstopped: ${formatJson(stopped.body)}` : ""}`, {
      action,
      success: true,
      body,
      stopped,
    });
  }
  if (action === "threads") {
    const body = await client.request("threads", {}, timeout);
    return text(
      (body.threads ?? []).map((t: any) => `${t.id}: ${t.name}`).join("\n") || "No threads",
      { action, success: true, threads: body.threads },
    );
  }
  if (action === "stack_trace") {
    const threadId = params.thread_id ?? session.currentThreadId;
    if (!threadId) return toolError("stack_trace requires thread_id", { action });
    const body = await client.request(
      "stackTrace",
      { threadId, startFrame: params.start_frame ?? 0, levels: params.levels ?? 20 },
      timeout,
    );
    if (body.stackFrames?.[0]?.id) session.currentFrameId = body.stackFrames[0].id;
    return text(formatStack(body.stackFrames ?? []) || "No stack frames", {
      action,
      success: true,
      stackFrames: body.stackFrames,
    });
  }
  if (action === "scopes") {
    const frameId = params.frame_id ?? session.currentFrameId;
    if (!frameId)
      return toolError("scopes requires frame_id (or run stack_trace first)", { action });
    const body = await client.request("scopes", { frameId }, timeout);
    return text(
      (body.scopes ?? [])
        .map((s: any) => `${s.variablesReference}: ${s.name} expensive=${!!s.expensive}`)
        .join("\n") || "No scopes",
      { action, success: true, scopes: body.scopes },
    );
  }
  if (action === "variables") {
    const variablesReference = params.variables_reference ?? params.scope_id;
    if (!variablesReference)
      return toolError("variables requires variables_reference or scope_id", { action });
    const body = await client.request(
      "variables",
      { variablesReference, start: params.start, count: params.count },
      timeout,
    );
    return text(
      (body.variables ?? [])
        .map(
          (v: any) =>
            `${v.variablesReference ? `${v.variablesReference} ` : ""}${v.name}: ${v.value}${v.type ? ` (${v.type})` : ""}`,
        )
        .join("\n") || "No variables",
      { action, success: true, variables: body.variables },
    );
  }
  if (action === "disassemble") {
    const memoryReference = params.memory_reference ?? params.instruction_reference;
    if (!memoryReference || !params.instruction_count)
      return toolError(
        "disassemble requires memory_reference/instruction_reference and instruction_count",
        { action },
      );
    const body = await client.request(
      "disassemble",
      {
        memoryReference,
        offset: params.offset,
        instructionOffset: params.instruction_offset,
        instructionCount: params.instruction_count,
        resolveSymbols: params.resolve_symbols,
      },
      timeout,
    );
    return text(
      (body.instructions ?? [])
        .map((i: any) => `${i.address}: ${i.instruction}${i.symbol ? ` ; ${i.symbol}` : ""}`)
        .join("\n") || "No instructions",
      { action, success: true, disassembly: body.instructions },
    );
  }
  if (action === "read_memory") {
    if (!params.memory_reference || !params.count)
      return toolError("read_memory requires memory_reference and count", { action });
    const body = await client.request(
      "readMemory",
      { memoryReference: params.memory_reference, offset: params.offset, count: params.count },
      timeout,
    );
    return text(formatJson(body), { action, success: true, memory: body });
  }
  if (action === "write_memory") {
    if (!params.memory_reference || !params.data)
      return toolError("write_memory requires memory_reference and base64 data", { action });
    const body = await client.request(
      "writeMemory",
      {
        memoryReference: params.memory_reference,
        offset: params.offset,
        data: params.data,
        allowPartial: params.allow_partial,
      },
      timeout,
    );
    return text(formatJson(body), { action, success: true, memory: body });
  }
  if (action === "modules") {
    const body = await client.request(
      "modules",
      { startModule: params.start_module, moduleCount: params.module_count },
      timeout,
    );
    return text(
      (body.modules ?? [])
        .map((m: any) => `${m.id ?? ""} ${m.name ?? ""} ${m.path ?? ""}`)
        .join("\n") || "No modules",
      { action, success: true, modules: body.modules },
    );
  }
  if (action === "loaded_sources") {
    const body = await client.request("loadedSources", {}, timeout);
    return text(
      (body.sources ?? []).map((s: any) => `${s.name ?? ""} ${s.path ?? ""}`).join("\n") ||
        "No loaded sources",
      { action, success: true, sources: body.sources },
    );
  }
  if (action === "evaluate") {
    if (!params.expression) return toolError("evaluate requires expression", { action });
    const body = await client.request(
      "evaluate",
      {
        expression: params.expression,
        frameId: params.frame_id ?? session.currentFrameId,
        context: params.context ?? "repl",
      },
      timeout,
    );
    return text(
      `${body.result}${body.type ? ` (${body.type})` : ""}${body.variablesReference ? `\nvariablesReference: ${body.variablesReference}` : ""}`,
      { action, success: true, evaluation: body },
    );
  }
  if (action === "output") {
    return text(client.output.join("") || "(no debug output captured)", { action, success: true });
  }
  if (action === "custom_request") {
    if (!params.command) return toolError("custom_request requires command", { action });
    const body = await client.request(params.command, params.arguments ?? {}, timeout);
    return text(formatJson(body), { action, success: true, body });
  }
  if (action === "terminate") {
    try {
      await client.request("terminate", {}, 5000);
    } catch {}
    try {
      await client.request("disconnect", { terminateDebuggee: true }, 5000);
    } catch {}
    client.dispose();
    dapSessions.delete(session.id);
    return text(`Terminated DAP session '${session.id}'`, { action, success: true });
  }
  return toolError(`Unknown debug action: ${action}`, { action });
}

const LspParams = Type.Object({
  action: Type.Union(
    [
      Type.Literal("status"),
      Type.Literal("reload"),
      Type.Literal("diagnostics"),
      Type.Literal("definition"),
      Type.Literal("type_definition"),
      Type.Literal("implementation"),
      Type.Literal("references"),
      Type.Literal("hover"),
      Type.Literal("symbols"),
      Type.Literal("workspace_symbols"),
      Type.Literal("rename"),
      Type.Literal("rename_file"),
      Type.Literal("code_actions"),
      Type.Literal("format"),
      Type.Literal("request"),
    ],
    { description: "LSP operation to run." },
  ),
  file: Type.Optional(
    Type.String({ description: "Target file path, relative to cwd unless absolute." }),
  ),
  root: Type.Optional(Type.String({ description: "Workspace root override." })),
  line: Type.Optional(Type.Number({ description: "1-indexed target line." })),
  character: Type.Optional(Type.Number({ description: "1-indexed target character/column." })),
  symbol: Type.Optional(
    Type.String({ description: "Symbol text on the target line; append #N for occurrence." }),
  ),
  new_name: Type.Optional(
    Type.String({
      description: "New symbol name for rename, or destination path for rename_file.",
    }),
  ),
  apply: Type.Optional(
    Type.Boolean({
      description: "Apply edits for rename/code_actions/format. Use false to preview.",
    }),
  ),
  query: Type.Optional(
    Type.String({
      description: "Workspace symbol query, code action selector, or request helper query.",
    }),
  ),
  kind: Type.Optional(
    Type.String({
      description: "LSP code action kind filter, e.g. quickfix or source.organizeImports.",
    }),
  ),
  include_declaration: Type.Optional(
    Type.Boolean({ description: "Include declaration in references. Default true." }),
  ),
  method: Type.Optional(Type.String({ description: "Raw LSP request method for action=request." })),
  payload: Type.Optional(
    Type.Any({ description: "Raw LSP request params for action=request (object or JSON string)." }),
  ),
  range: Type.Optional(
    Type.Object({
      start_line: Type.Number(),
      end_line: Type.Number(),
      start_character: Type.Optional(Type.Number()),
      end_character: Type.Optional(Type.Number()),
    }),
  ),
  tab_size: Type.Optional(Type.Number()),
  insert_spaces: Type.Optional(Type.Boolean()),
  limit: Type.Optional(Type.Number()),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds." })),
  server_command: Type.Optional(Type.String({ description: "Explicit LSP server command." })),
  server_args: Type.Optional(
    Type.Array(Type.String(), { description: "Explicit LSP server args." }),
  ),
  server_name: Type.Optional(Type.String()),
});

const DebugParams = Type.Object({
  action: Type.Union(
    [
      Type.Literal("launch"),
      Type.Literal("attach"),
      Type.Literal("set_breakpoint"),
      Type.Literal("remove_breakpoint"),
      Type.Literal("set_function_breakpoint"),
      Type.Literal("remove_function_breakpoint"),
      Type.Literal("set_instruction_breakpoint"),
      Type.Literal("remove_instruction_breakpoint"),
      Type.Literal("data_breakpoint_info"),
      Type.Literal("set_data_breakpoint"),
      Type.Literal("remove_data_breakpoint"),
      Type.Literal("continue"),
      Type.Literal("step_over"),
      Type.Literal("step_in"),
      Type.Literal("step_out"),
      Type.Literal("pause"),
      Type.Literal("threads"),
      Type.Literal("stack_trace"),
      Type.Literal("scopes"),
      Type.Literal("variables"),
      Type.Literal("disassemble"),
      Type.Literal("read_memory"),
      Type.Literal("write_memory"),
      Type.Literal("modules"),
      Type.Literal("loaded_sources"),
      Type.Literal("evaluate"),
      Type.Literal("output"),
      Type.Literal("custom_request"),
      Type.Literal("terminate"),
      Type.Literal("sessions"),
    ],
    { description: "DAP debug operation to run." },
  ),
  session: Type.Optional(Type.String({ description: "Debug session id. Default: default." })),
  adapter: Type.Optional(
    Type.String({ description: "Adapter hint: python/debugpy, lldb/lldb-dap, node." }),
  ),
  adapter_command: Type.Optional(
    Type.String({
      description: "Explicit DAP adapter command, e.g. 'python3 -m debugpy.adapter' or 'lldb-dap'.",
    }),
  ),
  adapter_args: Type.Optional(Type.Array(Type.String())),
  configuration: Type.Optional(
    Type.Any({ description: "Extra launch/attach configuration merged into the DAP request." }),
  ),
  program: Type.Optional(Type.String()),
  args: Type.Optional(Type.Array(Type.String())),
  cwd: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  pid: Type.Optional(Type.Number()),
  port: Type.Optional(Type.Number()),
  host: Type.Optional(Type.String()),
  console: Type.Optional(Type.String()),
  stop_on_entry: Type.Optional(Type.Boolean()),
  breakpoints: Type.Optional(Type.Array(Type.Object({ file: Type.String(), line: Type.Number() }))),
  file: Type.Optional(Type.String()),
  line: Type.Optional(Type.Number()),
  function: Type.Optional(Type.String()),
  condition: Type.Optional(Type.String()),
  hit_condition: Type.Optional(Type.String()),
  thread_id: Type.Optional(Type.Number()),
  frame_id: Type.Optional(Type.Number()),
  levels: Type.Optional(Type.Number()),
  start_frame: Type.Optional(Type.Number()),
  scope_id: Type.Optional(Type.Number()),
  variables_reference: Type.Optional(Type.Number()),
  start: Type.Optional(Type.Number()),
  count: Type.Optional(Type.Number()),
  instruction_reference: Type.Optional(Type.String()),
  instruction_count: Type.Optional(Type.Number()),
  instruction_offset: Type.Optional(Type.Number()),
  memory_reference: Type.Optional(Type.String()),
  offset: Type.Optional(Type.Number()),
  data: Type.Optional(Type.String()),
  data_id: Type.Optional(Type.String()),
  access_type: Type.Optional(
    Type.Union([Type.Literal("read"), Type.Literal("write"), Type.Literal("readWrite")]),
  ),
  allow_partial: Type.Optional(Type.Boolean()),
  resolve_symbols: Type.Optional(Type.Boolean()),
  start_module: Type.Optional(Type.Number()),
  module_count: Type.Optional(Type.Number()),
  expression: Type.Optional(Type.String()),
  context: Type.Optional(Type.String()),
  command: Type.Optional(Type.String()),
  arguments: Type.Optional(Type.Any()),
  timeout: Type.Optional(Type.Number()),
});

export default function lspDapTools(pi: ExtensionAPI) {
  pi.registerTool({
    name: "lsp",
    label: "LSP",
    description:
      "Use language servers for diagnostics, navigation, symbols, rename, code actions, formatting, and raw LSP requests.",
    promptSnippet:
      "Query language servers for diagnostics, definitions, references, hover, symbols, renames, code actions, formatting, and raw requests.",
    promptGuidelines: [
      "Use lsp for code intelligence: diagnostics, definitions, references, hover, symbols, rename, code_actions, format, and raw LSP requests.",
      "Use lsp rename or rename_file instead of manual edits when changing a symbol or moving a file across imports.",
    ],
    parameters: LspParams,
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: `LSP ${params.action}...` }] });
      try {
        return await runLsp(ctx, params);
      } catch (error: any) {
        return toolError(`LSP error: ${error?.message ?? String(error)}`, {
          action: params.action,
          stderr: error?.stderr,
        });
      }
    },
  });

  pi.registerTool({
    name: "debug",
    label: "Debug",
    description:
      "Drive a Debug Adapter Protocol session: launch/attach, breakpoints, stepping, stack, scopes, variables, evaluate, output, terminate.",
    promptSnippet:
      "Drive a DAP debugger session: launch/attach, breakpoints, stepping, threads, stack frames, scopes, variables, evaluate, and terminate.",
    promptGuidelines: [
      "Use debug when a real debugger is more appropriate than adding print statements, especially crashes, hangs, native code, or inspecting runtime state.",
      "Start with debug action=launch or attach, set breakpoints when needed, then inspect threads, stack_trace, scopes, variables, and evaluate expressions.",
    ],
    parameters: DebugParams,
    async execute(_toolCallId, params, _signal, onUpdate, ctx) {
      onUpdate?.({ content: [{ type: "text", text: `Debug ${params.action}...` }] });
      try {
        return await runDebug(ctx, params);
      } catch (error: any) {
        return toolError(`Debug error: ${error?.message ?? String(error)}`, {
          action: params.action,
        });
      }
    },
  });

  pi.registerCommand("lsp-dap-status", {
    description: "Show active LSP and DAP sessions from the global lsp-dap-tools extension",
    handler: async (_args, ctx) => {
      const lsp =
        [...lspClients.values()].map((c) => `${c.server.name} @ ${c.root}`).join("\n") || "(none)";
      const dap =
        [...dapSessions.values()].map((s) => `${s.id}: ${s.adapter}`).join("\n") || "(none)";
      ctx.ui.notify(`LSP:\n${lsp}\n\nDAP:\n${dap}`, "info");
    },
  });

  pi.on("session_shutdown", () => {
    for (const c of lspClients.values()) c.dispose();
    lspClients.clear();
    for (const s of dapSessions.values()) s.client.dispose();
    dapSessions.clear();
  });
}
