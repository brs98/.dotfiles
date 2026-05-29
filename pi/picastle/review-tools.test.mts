import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
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

test("confines filesystem command path arguments to the worktree", () => {
  assert.throws(() => planReviewCommand("cat /tmp/x", root), /absolute paths/);
  assert.throws(() => planReviewCommand("cat ~/.foo", root), /home paths/);
  assert.throws(() => planReviewCommand("grep x ../file", root), /parent directory/);
  assert.throws(() => planReviewCommand("find /tmp", root), /absolute paths/);

  const plan = planReviewCommand("cat pi/picastle/package.json", root);
  assert.deepEqual(plan.steps[0]?.argv, ["cat", "pi/picastle/package.json"]);
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
      tools: ["read", "grep", "find", "ls", "review_check"],
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
