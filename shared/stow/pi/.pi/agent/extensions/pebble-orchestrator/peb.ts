import { resolve } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { jsonData, type LabelPolicy, type OpenPr, type PebIssue } from "./shared.js";

export type ExecResult = { stdout: string; stderr: string; code: number | null; killed?: boolean };

const COMMAND_TIMEOUT_MS = 120_000;

export function createPebOps(pi: ExtensionAPI) {
  async function exec(
    command: string,
    args: string[],
    cwd: string,
    timeout = COMMAND_TIMEOUT_MS,
  ): Promise<ExecResult> {
    const result = (await pi.exec(command, args, { cwd, timeout })) as ExecResult;
    return result;
  }

  async function checked(
    command: string,
    args: string[],
    cwd: string,
    timeout = COMMAND_TIMEOUT_MS,
  ): Promise<ExecResult> {
    const result = await exec(command, args, cwd, timeout);
    if (result.code !== 0) {
      const rendered = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
      throw new Error(`${command} ${args.join(" ")} failed${rendered ? `:\n${rendered}` : ""}`);
    }
    return result;
  }

  async function detect(
    repoArg: string | undefined,
    cwd: string,
  ): Promise<{ repo: string; gitRoot: string }> {
    const start = repoArg ? resolve(cwd, repoArg) : cwd;
    const where = await checked("peb", ["where"], start);
    const repo = where.stdout.trim();
    if (!repo) throw new Error("peb where returned no workspace path.");
    const gitRoot = (await checked("git", ["rev-parse", "--show-toplevel"], repo)).stdout.trim();
    return { repo, gitRoot };
  }

  async function loadPolicy(repo: string): Promise<LabelPolicy> {
    const result = await exec("peb", ["config", "label-policy", "show", "--json"], repo);
    if (result.code !== 0) return {};
    return jsonData<LabelPolicy>(result.stdout);
  }

  async function listOpenPrs(repo: string): Promise<OpenPr[]> {
    try {
      const result = await exec(
        "gh",
        ["pr", "list", "--state", "open", "--json", "number,headRefName,url"],
        repo,
        30_000,
      );
      if (result.code !== 0) return [];
      return JSON.parse(result.stdout) as OpenPr[];
    } catch {
      return [];
    }
  }

  async function listBranches(gitRoot: string): Promise<string[]> {
    const result = await checked(
      "git",
      ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
      gitRoot,
    );
    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  async function currentBaseRef(gitRoot: string): Promise<string> {
    const result = await exec("git", ["branch", "--show-current"], gitRoot);
    const branch = result.stdout.trim();
    return branch || "HEAD";
  }

  async function showIssue(repo: string, id: string): Promise<PebIssue> {
    const result = await checked("peb", ["show", id, "--json"], repo);
    return jsonData<PebIssue>(result.stdout);
  }

  async function existingWorktrees(gitRoot: string): Promise<Map<string, string>> {
    const output = (await checked("git", ["worktree", "list", "--porcelain"], gitRoot)).stdout;
    const map = new Map<string, string>();
    let currentPath: string | undefined;
    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) currentPath = line.slice("worktree ".length);
      if (line.startsWith("branch refs/heads/") && currentPath)
        map.set(line.slice("branch refs/heads/".length), currentPath);
    }
    return map;
  }

  async function branchExists(gitRoot: string, branch: string): Promise<boolean> {
    const result = await exec("git", ["show-ref", "--verify", `refs/heads/${branch}`], gitRoot);
    return result.code === 0;
  }

  async function branchHasCommit(
    gitRoot: string,
    baseRef: string,
    branch: string,
  ): Promise<boolean> {
    const result = await exec("git", ["rev-list", "--count", `${baseRef}..${branch}`], gitRoot);
    return result.code === 0 && Number(result.stdout.trim()) > 0;
  }

  async function commentOnce(
    repo: string,
    issue: PebIssue,
    marker: string,
    body: string,
  ): Promise<void> {
    const latest = await showIssue(repo, issue.id);
    const exists = (latest.comments ?? []).some((comment) => comment.body?.includes(marker));
    if (exists) return;
    await checked("peb", ["comment", "add", issue.id, body], repo);
  }

  async function findOpenPrForBranch(gitRoot: string, branch: string): Promise<OpenPr | undefined> {
    const prs = await listOpenPrs(gitRoot);
    return prs.find((pr) => pr.headRefName === branch);
  }

  return {
    exec,
    checked,
    detect,
    loadPolicy,
    listOpenPrs,
    listBranches,
    currentBaseRef,
    showIssue,
    existingWorktrees,
    branchExists,
    branchHasCommit,
    commentOnce,
    findOpenPrForBranch,
  };
}

export type PebOps = ReturnType<typeof createPebOps>;
