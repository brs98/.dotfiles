import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentWorkspace,
  harvestAgentWorkspace,
  repoToplevel,
  sanitizeWorkspaceName,
} from "./worktree.js";

function hasBinary(name: string): boolean {
  try {
    execFileSync("which", [name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const HAS_PATCHTREE = hasBinary("patchtree") && hasBinary("git");
const describeIntegration = HAS_PATCHTREE ? describe : describe.skip;

describe("sanitizeWorkspaceName", () => {
  it("strips unsafe characters and trims dashes", () => {
    expect(sanitizeWorkspaceName("wf_abc-123/a1:review agents!")).toBe(
      "wf-abc-123-a1-review-agents",
    );
    expect(sanitizeWorkspaceName("///")).toBe("wf-agent");
  });
});

describeIntegration("patchtree-backed agent workspaces", () => {
  let baseRepo: string;
  let controlRoot: string;

  beforeAll(async () => {
    baseRepo = await mkdtemp(join(tmpdir(), "wf-iso-repo-"));
    controlRoot = await mkdtemp(join(tmpdir(), "wf-iso-control-"));
    const git = (...args: string[]) => execFileSync("git", ["-C", baseRepo, ...args]);
    git("init", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    await writeFile(join(baseRepo, "readme.md"), "hello\n");
    git("add", ".");
    git("commit", "-m", "init");
  }, 30_000);

  afterAll(async () => {
    await rm(baseRepo, { recursive: true, force: true });
    await rm(controlRoot, { recursive: true, force: true });
  });

  it("resolves the repo toplevel and rejects non-repos", async () => {
    await expect(repoToplevel(baseRepo)).resolves.toBeTruthy();
    await expect(repoToplevel(tmpdir())).rejects.toThrow(/git repository/);
  });

  it("auto-deletes an unchanged workspace", async () => {
    const ws = await createAgentWorkspace(baseRepo, "wf-test-clean", controlRoot);
    expect(existsSync(ws.path)).toBe(true);
    const harvest = await harvestAgentWorkspace(ws);
    expect(harvest.changed).toBe(false);
    expect(existsSync(ws.path)).toBe(false);
  }, 60_000);

  it("keeps a changed workspace and exports a patch", async () => {
    const ws = await createAgentWorkspace(baseRepo, "wf-test-dirty", controlRoot);
    await writeFile(join(ws.path, "new-file.txt"), "made by isolated agent\n");
    const harvest = await harvestAgentWorkspace(ws);
    expect(harvest.changed).toBe(true);
    expect(harvest.workspacePath).toBe(ws.path);
    expect(existsSync(ws.path)).toBe(true);
    expect(harvest.patchPath && existsSync(harvest.patchPath)).toBe(true);
  }, 60_000);

  it("handles concurrent forks without lock races", async () => {
    const names = ["wf-race-1", "wf-race-2", "wf-race-3"];
    const workspaces = await Promise.all(
      names.map((name) => createAgentWorkspace(baseRepo, name, controlRoot)),
    );
    expect(new Set(workspaces.map((w) => w.path)).size).toBe(3);
    for (const ws of workspaces) {
      const harvest = await harvestAgentWorkspace(ws);
      expect(harvest.changed).toBe(false);
    }
  }, 120_000);
});
