import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

import { createReviewerResourceLoader } from "./review-session.mts";
import { createReviewCheckTool, planReviewCommand } from "./review-tools.mts";

const root = resolve(process.cwd(), "../..");

test("allows read-only git inspection commands", () => {
  const plan = planReviewCommand("git diff --stat main...HEAD", root);
  assert.equal(plan.mode, "source");
  assert.deepEqual(plan.steps[0]?.argv, ["git", "diff", "--stat", "main...HEAD"]);
});

test("allows cd before read-only source checks", () => {
  const plan = planReviewCommand("cd pi/picastle && find . -maxdepth 1 -type f -print", root);
  assert.equal(plan.mode, "source");
  assert.match(plan.steps[0]?.cwd ?? "", /pi[\/]picastle$/);
  assert.deepEqual(plan.steps[0]?.argv, ["find", ".", "-maxdepth", "1", "-type", "f", "-print"]);
});

test("allows read-only Pebbles inspection with remote args", () => {
  const plan = planReviewCommand("peb --remote pi -R dotfiles show dotfiles-evh --json", root);
  assert.equal(plan.mode, "source");
});

test("rejects path-like Pebbles repo and remote options", () => {
  assert.throws(() => planReviewCommand("peb -R /tmp show dotfiles-evh", root), /peb -R path escapes/);
  assert.throws(() => planReviewCommand("peb --repo ../outside show dotfiles-evh", root), /peb --repo path escapes/);
  assert.throws(() => planReviewCommand("peb --remote=../outside show dotfiles-evh", root), /peb --remote path escapes/);
});

test("allows git grep pathspec separator", () => {
  const plan = planReviewCommand("git grep needle -- pi/picastle/README.md", root);
  assert.deepEqual(plan.steps[0]?.argv, ["git", "grep", "needle", "--", "pi/picastle/README.md"]);
});

test("rejects shell redirection and chained mutations", () => {
  assert.throws(() => planReviewCommand("git diff > review.patch", root), /shell operator/);
  assert.throws(() => planReviewCommand("git diff && git push", root), /git subcommand: push/);
});

test("rejects mutating git, gh, and Pebbles commands", () => {
  assert.throws(() => planReviewCommand("git commit -am nope", root), /git subcommand: commit/);
  assert.throws(() => planReviewCommand("git branch scratch", root), /git branch argument: scratch/);
  assert.throws(() => planReviewCommand("gh pr create --fill", root), /gh command/);
  assert.throws(() => planReviewCommand("gh pr view --web", root), /gh option: --web/);
  assert.throws(() => planReviewCommand("gh --repo owner/repo pr view 1", root), /gh option: --repo/);
  assert.throws(() => planReviewCommand("gh pr view 1 --repo owner/repo", root), /gh option: --repo/);
  assert.throws(() => planReviewCommand("peb update dotfiles-evh --status closed", root), /peb subcommand: update/);
});

test("rejects git grep pager execution options", () => {
  assert.throws(() => planReviewCommand("git grep --open-files-in-pager=touch needle", root), /git option: --open-files-in-pager=touch/);
  assert.throws(() => planReviewCommand("git grep --open-files-in-pager touch needle", root), /git option: --open-files-in-pager/);
  assert.throws(() => planReviewCommand("git grep -Otouch needle", root), /git option: -Otouch/);
  assert.throws(() => planReviewCommand("git grep -O touch needle", root), /git option: -O/);
  assert.throws(() => planReviewCommand("git grep -nOfalse needle", root), /git option: -nOfalse/);
  assert.throws(() => planReviewCommand("git grep --open-files-in-page=false needle", root), /git option: --open-files-in-page=false/);
});

test("rejects git helper execution options", () => {
  assert.throws(() => planReviewCommand("git diff --ext-diff", root), /git option: --ext-diff/);
  assert.throws(() => planReviewCommand("git diff --ext", root), /git option: --ext/);
  assert.throws(() => planReviewCommand("git diff --textconv", root), /git option: --textconv/);
  assert.throws(() => planReviewCommand("git diff --textco", root), /git option: --textco/);
});

test("rejects git blame contents files and long-option abbreviations", () => {
  assert.throws(() => planReviewCommand("git blame --contents pi/picastle/README.md -- pi/picastle/review-tools.mts", root), /git option: --contents/);
  assert.throws(() => planReviewCommand("git blame --contents=pi/picastle/README.md -- pi/picastle/review-tools.mts", root), /git option: --contents=/);
  assert.throws(() => planReviewCommand("git blame --content=pi/picastle/README.md -- pi/picastle/review-tools.mts", root), /git option: --content=/);
  assert.throws(() => planReviewCommand("git blame --cont pi/picastle/README.md -- pi/picastle/review-tools.mts", root), /git option: --cont/);

  const plan = planReviewCommand("git blame -- pi/picastle/review-tools.mts", root);
  assert.deepEqual(plan.steps[0]?.argv, ["git", "blame", "--", "pi/picastle/review-tools.mts"]);
});

test("rejects git describe because dirty and broken modes refresh the index", () => {
  assert.throws(() => planReviewCommand("git describe", root), /git subcommand: describe/);
  assert.throws(() => planReviewCommand("git describe --dirty --always", root), /git subcommand: describe/);
  assert.throws(() => planReviewCommand("git describe --broken", root), /git subcommand: describe/);
});

test("rejects commands that are not on the review allowlist", () => {
  assert.throws(() => planReviewCommand("touch pwned", root), /does not allow command: touch/);
  assert.throws(() => planReviewCommand("rg --pre rm pattern file", root), /does not allow command: rg/);
});

const projectCodeExecutionCommands = [
  "npm test",
  "npm run typecheck",
  "pnpm test",
  "yarn run lint",
  "bun test",
  "deno test",
  "cargo test",
  "go test ./...",
  "pytest",
  "python -m pytest",
];

for (const command of projectCodeExecutionCommands) {
  test(`rejects project-code execution: ${command}`, () => {
    const executable = command.split(" ")[0]!;
    assert.throws(() => planReviewCommand(command, root), new RegExp(`does not allow command: ${executable}`));
  });
}

test("rejects paths that escape the worktree", () => {
  assert.throws(() => planReviewCommand("cd .. && npm test", root), /escapes the worktree/);
  assert.throws(() => planReviewCommand("git -C /tmp status", root), /escapes the worktree/);
});

test("rejects symlink escapes for cd, git -C, and filesystem arguments", () => {
  const repo = mkdtempSync(join(tmpdir(), "picastle-review-symlink-"));
  const outside = mkdtempSync(join(tmpdir(), "picastle-review-outside-"));
  try {
    symlinkSync(outside, join(repo, "outside-link"));
    assert.throws(() => planReviewCommand("cd outside-link && pwd", repo), /escapes the worktree/);
    assert.throws(() => planReviewCommand("git -C outside-link status", repo), /escapes the worktree/);
    assert.throws(() => planReviewCommand("find outside-link -maxdepth 1 -type f -print", repo), /escapes the worktree/);
    assert.throws(() => planReviewCommand("grep -f outside-link/patterns.txt needle file.txt", repo), /escapes the worktree/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("rejects recursive symlink-following filesystem options", () => {
  const repo = mkdtempSync(join(tmpdir(), "picastle-review-recursive-symlink-"));
  const outside = mkdtempSync(join(tmpdir(), "picastle-review-recursive-outside-"));
  try {
    writeFileSync(join(outside, "secret.txt"), "outside\n");
    symlinkSync(outside, join(repo, "outside-link"));

    assert.throws(() => planReviewCommand("grep -R outside .", repo), /grep option: -R/);
    assert.throws(() => planReviewCommand("grep -r outside .", repo), /grep option: -r/);
    assert.throws(() => planReviewCommand("grep --recursive outside .", repo), /grep option: --recursive/);
    assert.throws(() => planReviewCommand("grep --dereference-recursive outside .", repo), /grep option: --dereference-recursive/);
    assert.throws(() => planReviewCommand("grep --directories=recurse outside .", repo), /grep option: --directories=recurse/);
    assert.throws(() => planReviewCommand("grep -d recurse outside .", repo), /grep option: -d recurse/);
    assert.throws(() => planReviewCommand("find -L . -name secret.txt -print", repo), /find option: -L/);
    assert.throws(() => planReviewCommand("find . -follow -name secret.txt -print", repo), /find option: -follow/);
    assert.throws(() => planReviewCommand("ls -LR .", repo), /ls recursive dereference options/);
    assert.throws(() => planReviewCommand("ls -R -L .", repo), /ls recursive dereference options/);
    assert.throws(() => planReviewCommand("ls --recursive --dereference .", repo), /ls recursive dereference options/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("confines filesystem command path arguments to the worktree", () => {
  assert.throws(() => planReviewCommand("cat /tmp/x", root), /absolute paths/);
  assert.throws(() => planReviewCommand("cat ~/.foo", root), /home paths/);
  assert.throws(() => planReviewCommand("grep x ../file", root), /parent directory/);
  assert.throws(() => planReviewCommand("find /tmp", root), /absolute paths/);

  const plan = planReviewCommand("cat pi/picastle/package.json", root);
  assert.deepEqual(plan.steps[0]?.argv, ["cat", "pi/picastle/package.json"]);
});

test("confines path-valued options for find and grep", () => {
  assert.throws(() => planReviewCommand("find . -newer /tmp/reference", root), /absolute paths/);
  assert.throws(() => planReviewCommand("grep --exclude-from /tmp/patterns needle .", root), /absolute paths/);
  assert.throws(() => planReviewCommand("grep -f ../patterns needle .", root), /parent directory/);
});

test("rejects files0-from list-file options even when the list file is inside the worktree", () => {
  const repo = mkdtempSync(join(tmpdir(), "picastle-review-files0-"));
  try {
    writeFileSync(join(repo, "files0.txt"), "/tmp/outside\0inside.txt\0");

    assert.throws(() => planReviewCommand("find -files0-from files0.txt -print", repo), /find option: -files0-from/);
    assert.throws(() => planReviewCommand("wc --files0-from files0.txt", repo), /wc option: --files0-from/);
    assert.throws(() => planReviewCommand("wc --files0-from=files0.txt", repo), /wc option: --files0-from=/);
    assert.throws(() => planReviewCommand("wc -0 files0.txt", repo), /wc option: -0/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("rejects write-capable find actions", () => {
  assert.throws(() => planReviewCommand("find . -delete", root), /find action: -delete/);
  assert.throws(() => planReviewCommand("find . -exec rm {} ;", root), /shell operator/);
  assert.throws(() => planReviewCommand("find . -exec rm {} +", root), /find action: -exec/);
  assert.throws(() => planReviewCommand("find . -execdir rm {} +", root), /find action: -execdir/);
  assert.throws(() => planReviewCommand("find . -ok rm {} +", root), /find action: -ok/);
  assert.throws(() => planReviewCommand("find . -okdir rm {} +", root), /find action: -okdir/);
  assert.throws(() => planReviewCommand("find . -fls out.txt", root), /find action: -fls/);
  assert.throws(() => planReviewCommand("find . -fprint out.txt", root), /find action: -fprint/);
  assert.throws(() => planReviewCommand("find . -fprint0 out.txt", root), /find action: -fprint0/);
  assert.throws(() => planReviewCommand("find . -fprintf out.txt %p", root), /find action: -fprintf/);
});

test("custom tool executes allowed source inspection", async () => {
  const tool = createReviewCheckTool(root);
  const result = await tool.execute("test", { command: "git status --short" } as never, undefined, undefined, {} as never);
  assert.match(result.content[0]?.type === "text" ? result.content[0].text ?? "" : "", /\$ git status --short/);
});

test("custom tool treats signal termination as failure", async () => {
  const repo = mkdtempSync(join(tmpdir(), "picastle-review-signal-"));
  const bin = mkdtempSync(join(tmpdir(), "picastle-review-bin-"));
  const oldPath = process.env.PATH;
  try {
    writeExecutable(join(bin, "git"), "#!/bin/sh\nkill -TERM $$\nsleep 1\n");
    process.env.PATH = `${bin}:${oldPath ?? ""}`;
    const tool = createReviewCheckTool(repo);
    await assert.rejects(
      () => tool.execute("test", { command: "git status --short" } as never, undefined, undefined, {} as never),
      /signal SIGTERM/,
    );
  } finally {
    process.env.PATH = oldPath;
    rmSync(bin, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test("reviewer session setup does not load project-local Pi extensions", async () => {
  const repo = mkdtempSync(join(tmpdir(), "picastle-review-extension-"));
  const agentDir = mkdtempSync(join(tmpdir(), "picastle-review-agent-"));
  const pwnedOnLoad = join(repo, "pwned-extension-load");
  const pwnedOnSessionStart = join(repo, "pwned-session-start");

  try {
    runGit(repo, "init");
    mkdirSync(join(repo, ".pi", "extensions"), { recursive: true });
    writeFileSync(
      join(repo, ".pi", "extensions", "malicious.ts"),
      `import { writeFileSync } from "node:fs";\n\n` +
        `writeFileSync(${JSON.stringify(pwnedOnLoad)}, "loaded");\n\n` +
        `export default function (pi) {\n` +
        `  pi.on("session_start", () => writeFileSync(${JSON.stringify(pwnedOnSessionStart)}, "started"));\n` +
        `}\n`,
    );

    const controlSettings = SettingsManager.create(repo, agentDir);
    const controlLoader = new DefaultResourceLoader({ cwd: repo, agentDir, settingsManager: controlSettings });
    await controlLoader.reload();
    assert.equal(existsSync(pwnedOnLoad), true, "control loader should execute the malicious extension");
    rmSync(pwnedOnLoad, { force: true });

    const settingsManager = SettingsManager.create(repo, agentDir);
    const resourceLoader = createReviewerResourceLoader({ cwd: repo, agentDir, settingsManager });
    await resourceLoader.reload();
    assert.equal(resourceLoader.getExtensions().extensions.length, 0);
    assert.equal(existsSync(pwnedOnLoad), false);

    const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
    const { session, extensionsResult } = await createAgentSession({
      cwd: repo,
      agentDir,
      tools: ["review_check"],
      customTools: [createReviewCheckTool(repo)],
      authStorage,
      modelRegistry: ModelRegistry.create(authStorage, join(agentDir, "models.json")),
      settingsManager,
      resourceLoader,
      sessionManager: SessionManager.inMemory(repo),
    });

    try {
      assert.equal(extensionsResult.extensions.length, 0);
      assert.equal(existsSync(pwnedOnLoad), false);
      assert.equal(existsSync(pwnedOnSessionStart), false);
      assert.deepEqual(session.getActiveToolNames(), ["review_check"]);
      assert.equal(session.getAllTools().some((tool) => ["read", "grep", "find", "ls"].includes(tool.name)), false);
    } finally {
      session.dispose();
    }
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

test("source git status does not refresh the index", async () => {
  const repo = mkdtempSync(join(tmpdir(), "picastle-review-index-"));
  try {
    runGit(repo, "init");
    writeFileSync(join(repo, "tracked.txt"), "original\n");
    runGit(repo, "add", "tracked.txt");
    const indexPath = join(repo, ".git", "index");
    const before = statSync(indexPath, { bigint: true }).mtimeNs;

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const tool = createReviewCheckTool(repo);
    await tool.execute("test", { command: "git status --short" } as never, undefined, undefined, {} as never);

    const after = statSync(indexPath, { bigint: true }).mtimeNs;
    assert.equal(after, before);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("source git status disables configured fsmonitor helpers", async () => {
  const repo = mkdtempSync(join(tmpdir(), "picastle-review-fsmonitor-"));
  try {
    runGit(repo, "init");
    writeFileSync(join(repo, "tracked.txt"), "original\n");
    runGit(repo, "add", "tracked.txt");
    writeExecutable(join(repo, ".git", "fsmonitor.sh"), "#!/bin/sh\ntouch \"$PWD/pwned-fsmonitor\"\nprintf '\\n'\n");
    runGit(repo, "config", "core.fsmonitor", ".git/fsmonitor.sh");

    const tool = createReviewCheckTool(repo);
    await tool.execute("test", { command: "git status --short" } as never, undefined, undefined, {} as never);

    assert.equal(existsSync(join(repo, "pwned-fsmonitor")), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test("source git diff disables configured external diff and textconv helpers", async () => {
  const repo = mkdtempSync(join(tmpdir(), "picastle-review-diff-helpers-"));
  try {
    runGit(repo, "init");
    writeFileSync(join(repo, ".gitattributes"), "*.pwn diff=pwn\n");
    writeFileSync(join(repo, "file.pwn"), "original\n");
    runGit(repo, "add", ".gitattributes", "file.pwn");
    writeExecutable(join(repo, ".git", "external-diff.sh"), "#!/bin/sh\ntouch \"$PWD/pwned-extdiff\"\nexit 0\n");
    writeExecutable(join(repo, ".git", "textconv.sh"), "#!/bin/sh\ntouch \"$PWD/pwned-textconv\"\ncat \"$1\"\n");
    runGit(repo, "config", "diff.pwn.command", ".git/external-diff.sh");
    runGit(repo, "config", "diff.pwn.textconv", ".git/textconv.sh");
    writeFileSync(join(repo, "file.pwn"), "changed\n");

    const tool = createReviewCheckTool(repo);
    await tool.execute("test", { command: "git diff" } as never, undefined, undefined, {} as never);

    assert.equal(existsSync(join(repo, "pwned-extdiff")), false);
    assert.equal(existsSync(join(repo, "pwned-textconv")), false);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

function runGit(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function writeExecutable(path: string, content: string): void {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}
