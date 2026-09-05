#!/usr/bin/env python3
"""Prepare isolated A/B worktrees and grade them without installing dependencies."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent


def execute(args, cwd=None):
    return subprocess.run(args, cwd=cwd, check=True, text=True, capture_output=True).stdout.strip()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def hashes(root):
    return {str(p.relative_to(root)): hashlib.sha256(
                b"symlink\0" + os.readlink(p).encode() if p.is_symlink() else p.read_bytes()).hexdigest()
            for p in sorted(root.rglob("*")) if p.is_symlink() or p.is_file()}


def verify_frozen(root, manifest):
    for directory, expected in manifest["frozen"].items():
        if hashes(root / directory) != expected:
            raise ValueError(f"Frozen evaluation inputs changed: {directory}")
    if hashes(Path(manifest["typescript"])) != manifest["compilerFiles"]:
        raise ValueError("Frozen compiler installation changed")


def prepare(args):
    root = args.run_root.resolve()
    compiler = args.typescript.resolve()
    skill = args.skill.resolve()
    if root.exists():
        raise ValueError("Run directory must not already exist; use a new directory for each pair")
    if not (compiler / "lib/typescript.js").is_file():
        raise ValueError("--typescript must point to an existing TypeScript package directory")
    if not (skill / "SKILL.md").is_file():
        raise ValueError("--skill must contain SKILL.md")
    if not (HERE / "grade.mjs").is_file():
        raise ValueError("Missing grader")
    version = json.loads((compiler / "package.json").read_text())["version"]
    root.mkdir(parents=True)
    frozen = root / "evaluation"
    frozen.mkdir()
    for name in ["fixture", "task.md", "grade.mjs", "run.py"]:
        source = HERE / name
        if source.is_dir():
            shutil.copytree(source, frozen / name)
        else:
            shutil.copy2(source, frozen / name)
    if (HERE / "run_cli.py").is_file():
        shutil.copy2(HERE / "run_cli.py", frozen / "run_cli.py")
    shutil.copytree(skill, root / "reference-skill")
    starter = root / "starter"
    shutil.copytree(frozen / "fixture", starter)
    shutil.copy2(frozen / "task.md", starter / "TASK.md")
    (starter / ".gitignore").write_text("node_modules/\ndist/\n")
    (starter / "AGENTS.md").write_text(
        "This is a controlled evaluation fixture. Follow TASK.md and the coordinator's "
        "reference-access instruction. Work only in this worktree. Do not install packages, "
        "use other agents, inspect other worktrees, or access evaluator files.\n")
    execute(["git", "init", "-q", "--initial-branch=main", str(starter)])
    execute(["git", "add", "."], starter)
    execute(["git", "-c", "user.name=Evaluation", "-c", "user.email=eval@localhost",
             "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgSign=false",
             "commit", "-qm", "Frozen webhook task starter"], starter)
    seed = args.seed if args.seed is not None else int.from_bytes(os.urandom(8), "big")
    conditions = ["without-skill", "with-skill"]
    random.Random(seed).shuffle(conditions)
    (root / "prompts").mkdir()
    (root / "results").mkdir()
    arms = {}
    for arm, condition in zip(["A", "B"], conditions):
        workspace = root / "agents" / arm
        execute(["git", "worktree", "add", "-q", "-b", f"candidate-{arm}", str(workspace)], starter)
        (workspace / "node_modules/.bin").mkdir(parents=True)
        (workspace / "node_modules/typescript").symlink_to(compiler, target_is_directory=True)
        (workspace / "node_modules/.bin/tsc").symlink_to(compiler / "bin/tsc")
        access = ("No reference skill is provided. Do not read or apply any skill files."
                  if condition == "without-skill" else
                  f"Read {root / 'reference-skill/SKILL.md'} and whichever linked rules are relevant. "
                  "This is the only reference skill provided; do not read other skills.")
        prompt = (
            "You are completing one arm of a user-authorized controlled evaluation. "
            "The user explicitly requests a with-skill versus without-skill comparison, so this "
            "arm's reference-access policy overrides general instructions to load skills.\n\n"
            f"Your writable workspace is {workspace}. Read its AGENTS.md and TASK.md, then complete the task.\n\n"
            f"Reference-access policy: {access}\n\n"
            f"The existing compiler dependency is {compiler}; you may use the provided npm scripts. "
            "Do not install dependencies, browse the web, consult other repositories, access other "
            "agent worktrees, inspect evaluator files/results/manifests, or use subagents. "
            "You may inspect only your worktree, the installed compiler, and explicitly provided "
            "reference files. Use the same normal diligence you would on a production task. "
            "Do not change protected fixture files or commit. Report the commands you ran, their "
            "outcomes, any assertions you introduced, and which reference files you read.\n"
        )
        (root / "prompts" / f"{arm}.md").write_text(prompt)
        arms[arm] = {"condition": condition, "workspace": str(workspace), "status": "prepared"}
    manifest = {
        "schemaVersion": 1, "task": "webhook-client-v1", "seed": seed,
        "createdAt": time.time(), "typescript": str(compiler), "compilerVersion": version,
        "compilerFiles": hashes(compiler),
        "nodeVersion": execute(["node", "--version"]),
        "model": "inherit the same parent model and reasoning for both arms; record actual ID if exposed",
        "isolation": "separate Git worktrees; access policy is instructional, not a security sandbox",
        "arms": arms, "frozen": {name: hashes(root / name) for name in ["evaluation", "reference-skill", "prompts"]},
    }
    write_json(root / "manifest.json", manifest)
    print(json.dumps({"runRoot": str(root), "prompts": [str(root / "prompts" / f"{arm}.md") for arm in arms]}, indent=2))


def mark(args):
    root = args.run_root.resolve()
    manifest = json.loads((root / "manifest.json").read_text())
    verify_frozen(root, manifest)
    arm = manifest["arms"][args.arm]
    if args.event == "start":
        if arm["status"] != "prepared":
            raise ValueError("An arm may only start once; create a new run for another attempt")
        arm.update(status="running", startedAt=time.time(), agent=args.agent)
    else:
        if arm["status"] != "running":
            raise ValueError("Only a running arm may finish")
        # Freeze the submission at completion, not whenever grading happens later.
        workspace = Path(arm["workspace"])
        snapshot = root / "results" / f"{args.arm}.submission"
        shutil.copytree(workspace, snapshot, symlinks=True,
                        ignore=shutil.ignore_patterns(".git", "node_modules", "dist"))
        arm["submissionHashes"] = hashes(snapshot)
        patch = execute(["git", "diff", "--no-ext-diff", "HEAD", "--", "."], workspace)
        (root / "results" / f"{args.arm}.patch").write_text(patch + "\n")
        arm.update(status=args.event, finishedAt=time.time())
        arm["elapsedSeconds"] = arm["finishedAt"] - arm["startedAt"]
        if args.response:
            shutil.copy2(args.response, root / "results" / f"{args.arm}.response.md")
    write_json(root / "manifest.json", manifest)


def grade(args):
    root = args.run_root.resolve()
    manifest = json.loads((root / "manifest.json").read_text())
    verify_frozen(root, manifest)
    results = {}
    for name, arm in manifest["arms"].items():
        if arm["status"] not in ["complete", "failed"]:
            raise ValueError(f"Arm {name} has not finished; mark complete or failed first")
        output_path = root / "results" / f"{name}.json"
        if output_path.exists():
            raise ValueError("This run is already graded; do not selectively rerun candidates")
    # Publish nothing until both graders succeed, allowing infrastructure-only retries
    # against exactly the same completed submissions.
    with tempfile.TemporaryDirectory(prefix=".grading-", dir=root) as staged_directory:
        staged = Path(staged_directory)
        for name, arm in manifest["arms"].items():
            snapshot = root / "results" / f"{name}.submission"
            if hashes(snapshot) != arm["submissionHashes"]:
                raise ValueError(f"Completed submission changed: {name}")
            result = subprocess.run(["node", str(root / "evaluation/grade.mjs"), str(snapshot),
                                     manifest["typescript"]], text=True, capture_output=True, timeout=180)
            if result.returncode != 0:
                raise RuntimeError(f"Grader infrastructure failure for {name}: {result.stderr}\n{result.stdout}")
            report = json.loads(result.stdout)
            write_json(staged / f"{name}.json", report)
            results[name] = {"condition": arm["condition"], "status": arm["status"],
                             "elapsedSeconds": arm.get("elapsedSeconds"), "summary": report["summary"]}
        verify_frozen(root, manifest)
        write_json(staged / "comparison.json", {
            "task": manifest["task"], "compilerVersion": manifest["compilerVersion"], "arms": results,
            "interpretation": "One paired pilot; no statistical effectiveness or speed claim. Read individual checks and submissions.",
        })
        for output in staged.iterdir():
            output.replace(root / "results" / output.name)
    print((root / "results/comparison.json").read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("prepare")
    p.add_argument("--run-root", type=Path, required=True)
    p.add_argument("--typescript", type=Path, required=True)
    p.add_argument("--skill", type=Path, required=True)
    p.add_argument("--seed", type=int)
    p.set_defaults(func=prepare)
    p = commands.add_parser("mark")
    p.add_argument("--run-root", type=Path, required=True)
    p.add_argument("--arm", choices=["A", "B"], required=True)
    p.add_argument("--event", choices=["start", "complete", "failed"], required=True)
    p.add_argument("--agent", default="unspecified")
    p.add_argument("--response", type=Path)
    p.set_defaults(func=mark)
    p = commands.add_parser("grade")
    p.add_argument("--run-root", type=Path, required=True)
    p.set_defaults(func=grade)
    args = parser.parse_args()
    if args.command == "prepare":
        args.func(args)
    else:
        # Prevent parallel coordinator status updates from overwriting each other.
        with (args.run_root.resolve() / ".coordinator.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            args.func(args)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, subprocess.SubprocessError) as error:
        sys.exit(str(error))
