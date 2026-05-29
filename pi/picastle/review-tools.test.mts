import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { createReviewCheckTool, planReviewCommand } from "./review-tools.mts";

const root = resolve(process.cwd(), "../..");

test("allows read-only git inspection commands", () => {
  const plan = planReviewCommand("git diff --stat main...HEAD", root);
  assert.equal(plan.mode, "source");
  assert.deepEqual(plan.steps[0]?.argv, ["git", "diff", "--stat", "main...HEAD"]);
});

test("allows cd before disposable package checks", () => {
  const plan = planReviewCommand("cd pi/picastle && npm run typecheck", root);
  assert.equal(plan.mode, "copy");
  assert.match(plan.steps[0]?.cwd ?? "", /pi[\/]picastle$/);
  assert.deepEqual(plan.steps[0]?.argv, ["npm", "run", "typecheck"]);
});

test("allows read-only Pebbles inspection with remote args", () => {
  const plan = planReviewCommand("peb --remote pi -R dotfiles show dotfiles-evh --json", root);
  assert.equal(plan.mode, "source");
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

test("rejects commands that are not on the review allowlist", () => {
  assert.throws(() => planReviewCommand("touch pwned", root), /does not allow command: touch/);
  assert.throws(() => planReviewCommand("npm install", root), /only allows npm test/);
  assert.throws(() => planReviewCommand("rg --pre rm pattern file", root), /does not allow command: rg/);
});

test("rejects paths that escape the worktree", () => {
  assert.throws(() => planReviewCommand("cd .. && npm test", root), /escapes the worktree/);
  assert.throws(() => planReviewCommand("git -C /tmp status", root), /escapes the worktree/);
});

test("rejects disposable-copy checks that target the source worktree", () => {
  assert.throws(
    () => planReviewCommand(`python -m pytest --junitxml ${root}/pytest.xml`, root),
    /copy-mode arguments must stay within the disposable copy/,
  );
  assert.throws(
    () => planReviewCommand(`cargo build --target-dir ${root}/target-review`, root),
    /copy-mode arguments must stay within the disposable copy/,
  );
  assert.throws(
    () => planReviewCommand(`npm run test -- --output=${root}/review-output.txt`, root),
    /copy-mode arguments must stay within the disposable copy/,
  );
  assert.throws(
    () => planReviewCommand("pytest --junitxml ../pytest.xml", root),
    /copy-mode arguments must stay within the disposable copy/,
  );
});

test("custom tool executes allowed source inspection", async () => {
  const tool = createReviewCheckTool(root);
  const result = await tool.execute("test", { command: "git status --short" } as never, undefined, undefined, {} as never);
  assert.match(result.content[0]?.type === "text" ? result.content[0].text ?? "" : "", /\$ git status --short/);
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

function runGit(cwd: string, ...args: string[]): void {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}
