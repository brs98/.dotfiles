import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

interface WorkspaceConfig {
  default?: string;
  aliases?: Record<string, string>;
  workspaces?: Record<string, string>;
}

interface Workspace {
  alias: string;
  path: string;
}

type WorkspaceState = Workspace | null;

const STATE_ENTRY = "workspace-switcher-state";
const STATUS_KEY = "workspace";

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function normalizeConfig(raw: unknown): WorkspaceConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;

  const aliases: Record<string, string> = {};

  // Compact form: { "core": "/repo", "community": "/repo2" }
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" && key !== "default") {
      aliases[key] = value;
    }
  }

  // Explicit forms: { aliases: {...} } or { workspaces: {...} }
  for (const field of ["aliases", "workspaces"] as const) {
    const nested = record[field];
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) continue;
    for (const [key, value] of Object.entries(nested as Record<string, unknown>)) {
      if (typeof value === "string") aliases[key] = value;
    }
  }

  return {
    default: typeof record.default === "string" ? record.default : undefined,
    aliases,
  };
}

function loadWorkspaceConfig(cwd: string): WorkspaceConfig {
  const paths = [join(getAgentDir(), "workspaces.json"), join(cwd, ".pi", "workspaces.json")];
  const aliases: Record<string, string> = {};
  let defaultWorkspace: string | undefined;

  for (const path of paths) {
    if (!existsSync(path)) continue;
    try {
      const config = normalizeConfig(loadJson(path));
      Object.assign(aliases, config.aliases ?? {}, config.workspaces ?? {});
      if (config.default) defaultWorkspace = config.default;
    } catch (error) {
      console.error(`Failed to load workspace config from ${path}: ${error}`);
    }
  }

  return { aliases, default: defaultWorkspace };
}

function refreshWorkspaces(cwd: string) {
  workspaceConfig = loadWorkspaceConfig(cwd);
  workspaces = workspacesFromConfig(workspaceConfig);
}

function workspacesFromConfig(config: WorkspaceConfig): Workspace[] {
  const aliases = config.aliases ?? {};
  return Object.entries(aliases)
    .map(([alias, path]) => ({ alias, path: resolve(expandHome(path)) }))
    .filter((workspace) => isExistingDirectory(workspace.path))
    .sort((a, b) => a.alias.localeCompare(b.alias));
}

function isExistingDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isRelativeFilesystemPath(path: string): boolean {
  if (!path) return false;
  if (isAbsolute(path)) return false;
  if (path === "~" || path.startsWith("~/")) return false;
  // Avoid rewriting URI-ish values if some custom tool also has a `path` field.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) return false;
  return true;
}

function normalizeToolPath(path: string): string {
  // Pi's built-in tools accept @path from file-reference completions and strip
  // the leading @ before resolving. Preserve that behavior before rewriting.
  return path.startsWith("@") ? path.slice(1) : path;
}

function resolveAgainstWorkspace(path: string, workspace: Workspace): string {
  return resolve(workspace.path, path);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function shortPath(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

function describeWorkspace(workspace: Workspace): string {
  return `${workspace.alias} (${shortPath(workspace.path)})`;
}

function statusText(ctx: ExtensionContext, workspace: WorkspaceState): string | undefined {
  if (!workspace) return undefined;
  return ctx.ui.theme.fg("accent", `repo:${workspace.alias}`);
}

function setActiveWorkspace(ctx: ExtensionContext, workspace: WorkspaceState) {
  activeWorkspace = workspace;
  piAppendWorkspaceState(workspace);
  updateStatus(ctx);
}

let activeWorkspace: WorkspaceState = null;
let workspaces: Workspace[] = [];
let workspaceConfig: WorkspaceConfig = {};
let workspaceConfigCwd = process.cwd();
let appendState: ((customType: string, data?: unknown) => void) | null = null;

function piAppendWorkspaceState(workspace: WorkspaceState) {
  appendState?.(
    STATE_ENTRY,
    workspace ? { alias: workspace.alias, path: workspace.path } : { alias: null, path: null },
  );
}

function updateStatus(ctx: ExtensionContext) {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus(STATUS_KEY, statusText(ctx, activeWorkspace));
}

function findWorkspace(query: string): Workspace | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;

  const exact = workspaces.find(
    (workspace) => workspace.alias === trimmed || workspace.path === expandHome(trimmed),
  );
  if (exact) return exact;

  const lower = trimmed.toLowerCase();
  const fuzzy = workspaces.find(
    (workspace) =>
      workspace.alias.toLowerCase().includes(lower) || workspace.path.toLowerCase().includes(lower),
  );
  if (fuzzy) return fuzzy;

  const maybePath = resolve(expandHome(trimmed));
  if (isExistingDirectory(maybePath)) {
    return { alias: basename(maybePath) || maybePath, path: maybePath };
  }

  return undefined;
}

function completionItems(prefix: string): AutocompleteItem[] | null {
  refreshWorkspaces(workspaceConfigCwd);

  const builtins = ["clear", "list", "status"].map((value) => ({ value, label: value }));
  const configured = workspaces.map((workspace) => ({
    value: workspace.alias,
    label: workspace.alias,
    description: workspace.path,
  }));
  const lower = prefix.trim().toLowerCase();
  const items = [...builtins, ...configured].filter(
    (item) =>
      !lower ||
      item.value.toLowerCase().includes(lower) ||
      item.label.toLowerCase().includes(lower),
  );
  return items.length > 0 ? items : null;
}

function latestPersistedWorkspace(ctx: ExtensionContext): WorkspaceState | undefined {
  const entry = ctx.sessionManager
    .getBranch()
    .filter(
      (e: { type: string; customType?: string }) =>
        e.type === "custom" && e.customType === STATE_ENTRY,
    )
    .pop() as { data?: { alias?: unknown; path?: unknown } } | undefined;

  if (!entry) return undefined;
  if (entry.data?.alias === null || entry.data?.path === null) return null;
  if (typeof entry.data?.alias === "string" && typeof entry.data?.path === "string") {
    return { alias: entry.data.alias, path: entry.data.path };
  }
  return undefined;
}

async function selectWorkspace(ctx: ExtensionContext): Promise<WorkspaceState | undefined> {
  if (!ctx.hasUI) return undefined;
  const choices = ["(clear)", ...workspaces.map(describeWorkspace)];
  const choice = await ctx.ui.select("Select active workspace", choices);
  if (!choice) return undefined;
  if (choice === "(clear)") return null;
  return workspaces.find((workspace) => describeWorkspace(workspace) === choice);
}

function resolveOptionalPathInput(input: Record<string, unknown>, workspace: Workspace) {
  if (typeof input.path === "string") {
    const path = normalizeToolPath(input.path);
    input.path = isRelativeFilesystemPath(path) ? resolveAgainstWorkspace(path, workspace) : path;
  } else {
    input.path = workspace.path;
  }
}

function resolveRequiredPathInput(input: Record<string, unknown>, workspace: Workspace) {
  if (typeof input.path === "string") {
    const path = normalizeToolPath(input.path);
    input.path = isRelativeFilesystemPath(path) ? resolveAgainstWorkspace(path, workspace) : path;
  }
}

function mutateToolInputForWorkspace(
  event: { toolName: string; input: unknown },
  workspace: Workspace,
) {
  if (event.toolName === "bash" && event.input && typeof event.input === "object") {
    const input = event.input as Record<string, unknown>;
    if (typeof input.command === "string") {
      input.command = `cd ${shellQuote(workspace.path)} && ${input.command}`;
    }
    return;
  }

  if (!event.input || typeof event.input !== "object") return;
  const input = event.input as Record<string, unknown>;

  if (["read", "write", "edit"].includes(event.toolName)) {
    resolveRequiredPathInput(input, workspace);
  }

  if (["ls", "grep", "find"].includes(event.toolName)) {
    resolveOptionalPathInput(input, workspace);
  }

  // Quality-of-life for common cwd-aware extension tools without making them required.
  if (event.toolName === "lsp_diagnostics") {
    resolveRequiredPathInput(input, workspace);
    if (typeof input.cwd !== "string") input.cwd = workspace.path;
  }

  if (
    (event.toolName === "peb_plan" || event.toolName === "peb_sync_github") &&
    typeof input.repo !== "string"
  ) {
    input.repo = workspace.path;
  }
}

export default function workspaceSwitcher(pi: ExtensionAPI) {
  appendState = pi.appendEntry.bind(pi);

  pi.on("session_start", (_event, ctx) => {
    workspaceConfigCwd = ctx.cwd;
    refreshWorkspaces(workspaceConfigCwd);

    const restored = latestPersistedWorkspace(ctx);
    if (restored !== undefined) {
      activeWorkspace = restored && isExistingDirectory(restored.path) ? restored : null;
    } else {
      // Require an explicit /repo selection before rewriting tool calls. This avoids
      // a project-local .pi/workspaces.json silently redirecting writes or bash.
      activeWorkspace = null;
    }

    updateStatus(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI) ctx.ui.setStatus(STATUS_KEY, undefined);
  });

  pi.registerCommand("repo", {
    description: "Set an active workspace for relative tool paths and bash cwd",
    getArgumentCompletions: completionItems,
    handler: async (args, ctx) => {
      workspaceConfigCwd = ctx.cwd;
      refreshWorkspaces(workspaceConfigCwd);
      const arg = (args ?? "").trim();

      if (arg === "clear" || arg === "none" || arg === "off") {
        setActiveWorkspace(ctx, null);
        ctx.ui.notify("Workspace cleared; tools will use Pi launch cwd", "info");
        return;
      }

      if (arg === "list") {
        const body =
          workspaces.length > 0
            ? workspaces.map((workspace) => `- ${describeWorkspace(workspace)}`).join("\n")
            : "No workspaces configured. Add ~/.pi/agent/workspaces.json.";
        ctx.ui.notify(body, "info");
        return;
      }

      if (arg === "status") {
        ctx.ui.notify(
          activeWorkspace
            ? `Active workspace: ${describeWorkspace(activeWorkspace)}`
            : `No active workspace; tools use Pi launch cwd: ${shortPath(ctx.cwd)}`,
          "info",
        );
        return;
      }

      if (!arg) {
        const selected = await selectWorkspace(ctx);
        if (selected === undefined) {
          ctx.ui.notify(
            activeWorkspace
              ? `Active workspace: ${describeWorkspace(activeWorkspace)}`
              : `No active workspace. Available: ${workspaces.map((w) => w.alias).join(", ") || "none"}`,
            "info",
          );
          return;
        }
        setActiveWorkspace(ctx, selected);
        ctx.ui.notify(
          selected ? `Active workspace: ${describeWorkspace(selected)}` : "Workspace cleared",
          "info",
        );
        return;
      }

      const workspace = findWorkspace(arg);
      if (!workspace) {
        ctx.ui.notify(
          `Unknown workspace: ${arg}. Run /repo list to see configured aliases.`,
          "error",
        );
        return;
      }

      setActiveWorkspace(ctx, workspace);
      ctx.ui.notify(`Active workspace: ${describeWorkspace(workspace)}`, "info");
    },
  });

  pi.on("before_agent_start", async (event, ctx) => {
    if (!activeWorkspace) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\nWorkspace switcher is active. Treat ${activeWorkspace.alias} (${activeWorkspace.path}) as the active workspace for relative paths. The workspace-switcher extension rewrites relative read/write/edit/ls/grep/find paths and bash commands to execute from that directory. Pi's launch cwd remains ${ctx.cwd}.`,
    };
  });

  pi.on("tool_call", async (event) => {
    if (!activeWorkspace) return;
    mutateToolInputForWorkspace(event, activeWorkspace);
  });
}
