import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const EXEC_OPTS = { timeout: 60_000, maxBuffer: 32 * 1024 * 1024 };

export interface AgentWorkspace {
  name: string;
  path: string;
  controlDir: string;
}

export interface WorkspaceHarvest {
  changed: boolean;
  workspacePath?: string;
  patchPath?: string;
  note?: string;
}

/**
 * Patchtree mutations (init/fork/delete) share control-dir state and lock
 * files; serialize them so concurrent isolated agents never race. Agent
 * processes themselves still run fully in parallel.
 */
let mutationChain: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = mutationChain.then(fn, fn);
  mutationChain = next.catch(() => {});
  return next;
}

async function patchtree(controlDir: string, args: string[], env?: NodeJS.ProcessEnv) {
  try {
    return await execFileAsync("patchtree", args, {
      ...EXEC_OPTS,
      cwd: controlDir,
      env: env ? { ...process.env, ...env } : process.env,
    });
  } catch (error) {
    const detail =
      error && typeof error === "object" && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr).trim()
        : "";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`patchtree ${args[0]} failed: ${detail || message}`);
  }
}

export async function repoToplevel(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", cwd, "rev-parse", "--show-toplevel"],
      EXEC_OPTS,
    );
    return stdout.trim();
  } catch {
    throw new Error(
      `isolation: "worktree" requires the agent cwd to be inside a git repository (cwd: ${cwd})`,
    );
  }
}

export function sanitizeWorkspaceName(raw: string): string {
  return (
    raw
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "wf-agent"
  );
}

function defaultControlDir(baseRepo: string): string {
  const hash = createHash("sha256").update(baseRepo).digest("hex").slice(0, 8);
  return join(homedir(), ".cache", "pi-workflow", `${basename(baseRepo)}-${hash}`);
}

export async function createAgentWorkspace(
  baseRepo: string,
  name: string,
  controlRoot?: string,
): Promise<AgentWorkspace> {
  const controlDir = controlRoot ?? defaultControlDir(baseRepo);
  return serialized(async () => {
    await mkdir(controlDir, { recursive: true });
    if (!existsSync(join(controlDir, ".workspace-state"))) {
      await patchtree(controlDir, ["init", baseRepo]);
    }
    await patchtree(controlDir, ["fork", name], { WS_MATERIALIZATION_POLICY: "worktree" });
    const { stdout } = await patchtree(controlDir, ["path", name]);
    const path = stdout.trim();
    if (!path || !existsSync(path)) {
      throw new Error(`patchtree fork "${name}" did not yield a usable workspace path`);
    }
    return { name, path, controlDir };
  });
}

/**
 * After an isolated agent finishes: auto-delete an unchanged workspace;
 * keep a changed one and export its diff as a git patch.
 */
export async function harvestAgentWorkspace(workspace: AgentWorkspace): Promise<WorkspaceHarvest> {
  const { stdout: diff } = await patchtree(workspace.controlDir, ["diff", workspace.name]);
  if (!diff.trim()) {
    await serialized(() => patchtree(workspace.controlDir, ["delete", workspace.name, "--force"]));
    return { changed: false };
  }

  const patchDir = join(workspace.controlDir, "patches");
  await mkdir(patchDir, { recursive: true });
  const patchPath = join(patchDir, `${workspace.name}.patch`);
  await patchtree(workspace.controlDir, ["export", workspace.name, "--patch", patchPath]);
  return {
    changed: true,
    workspacePath: workspace.path,
    patchPath,
    note: `worktree kept: ${workspace.path} · patch: ${patchPath} (apply with \`git apply ${patchPath}\`)`,
  };
}
