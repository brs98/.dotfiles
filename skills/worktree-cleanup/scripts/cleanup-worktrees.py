#!/usr/bin/env python3
"""Audit and optionally remove stale Git worktrees."""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Worktree:
    path: str
    head: str = ""
    branch: str | None = None
    bare: bool = False


def run(cmd: list[str], *, check: bool = False, cwd: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=cwd, text=True, capture_output=True, check=check)


def git_dir_for(repo: str) -> str:
    p = Path(repo).expanduser().resolve()
    if p.is_dir() and (p / "HEAD").exists() and (p / "objects").exists():
        return str(p)
    result = run(["git", "-C", str(p), "rev-parse", "--git-common-dir"])
    if result.returncode != 0:
        raise SystemExit(f"Not a git repo or git dir: {repo}\n{result.stderr.strip()}")
    common = result.stdout.strip()
    if not os.path.isabs(common):
        common = str((p / common).resolve())
    return common


def parse_worktrees(git_dir: str) -> list[Worktree]:
    out = run(["git", "--git-dir", git_dir, "worktree", "list", "--porcelain"], check=True).stdout
    entries: list[Worktree] = []
    cur: dict[str, str | bool] = {}
    for line in out.splitlines():
        if not line:
            if cur:
                entries.append(Worktree(
                    path=str(cur["worktree"]),
                    head=str(cur.get("HEAD", "")),
                    branch=cur.get("branch") if isinstance(cur.get("branch"), str) else None,
                    bare=bool(cur.get("bare", False)),
                ))
                cur = {}
            continue
        key, *rest = line.split(" ", 1)
        cur[key] = rest[0] if rest else True
    if cur:
        entries.append(Worktree(
            path=str(cur["worktree"]),
            head=str(cur.get("HEAD", "")),
            branch=cur.get("branch") if isinstance(cur.get("branch"), str) else None,
            bare=bool(cur.get("bare", False)),
        ))
    return entries


def remote_slug(git_dir: str) -> str | None:
    url = run(["git", "--git-dir", git_dir, "config", "--get", "remote.origin.url"]).stdout.strip()
    if not url:
        return None
    patterns = [
        r"git@github\.com:(?P<slug>[^/]+/[^.]+)(?:\.git)?$",
        r"https://github\.com/(?P<slug>[^/]+/[^.]+)(?:\.git)?$",
    ]
    for pattern in patterns:
        m = re.match(pattern, url)
        if m:
            return m.group("slug")
    return None


def open_pr_branches(git_dir: str) -> set[str]:
    slug = remote_slug(git_dir)
    if not slug:
        return set()
    result = run(["gh", "-R", slug, "pr", "list", "--author", "@me", "--state", "open", "--json", "headRefName", "--jq", ".[].headRefName"])
    if result.returncode != 0:
        return set()
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def status_lines(path: str) -> list[str] | None:
    if not os.path.isdir(path):
        return None
    result = run(["git", "-C", path, "status", "--porcelain"])
    if result.returncode != 0:
        return None
    return result.stdout.splitlines()


def summarize_status(lines: list[str] | None) -> str:
    if lines is None:
        return "missing/status-failed"
    if not lines:
        return "clean"
    counts: dict[str, int] = {}
    for line in lines:
        key = {
            "??": "untracked",
            " M": "modified",
            "M ": "staged-modified",
            "A ": "staged-added",
            " D": "deleted",
            "D ": "staged-deleted",
            "R ": "renamed",
            "AM": "added+modified",
        }.get(line[:2], line[:2].strip() or "changed")
        counts[key] = counts.get(key, 0) + 1
    return ", ".join(f"{v} {k}" for k, v in counts.items())


def branch_short(ref: str | None) -> str | None:
    if not ref:
        return None
    return ref.removeprefix("refs/heads/")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", action="append", required=True, help="Git dir, bare repo, or worktree path. Repeat for multiple repos.")
    parser.add_argument("--keep-branch", action="append", default=[], help="Branch to keep, e.g. main or feature/x. Repeatable.")
    parser.add_argument("--keep-open-prs", action="store_true", help="Keep branches for open PRs authored by the current GitHub user.")
    parser.add_argument("--remove-clean", action="store_true", help="Remove clean non-kept worktrees.")
    parser.add_argument("--force-dirty", action="store_true", help="Force-remove dirty non-kept worktrees. Requires --yes.")
    parser.add_argument("--yes", action="store_true", help="Actually remove candidates. Without this, always dry-runs.")
    args = parser.parse_args()

    if args.force_dirty and not args.yes:
        raise SystemExit("--force-dirty requires --yes")

    removed = 0
    for repo in args.repo:
        git_dir = git_dir_for(repo)
        keep = {"main", "master", *args.keep_branch}
        if args.keep_open_prs:
            keep |= open_pr_branches(git_dir)

        print(f"### {git_dir}")
        print("Keeping branches: " + ", ".join(sorted(keep)))

        for wt in parse_worktrees(git_dir):
            short = branch_short(wt.branch)
            lines = [] if wt.bare else status_lines(wt.path)
            status = "bare" if wt.bare else summarize_status(lines)
            kept = wt.bare or (short in keep)
            label = short or "detached"
            action = "KEEP" if kept else "CANDIDATE"
            print(f"{action:9} {status:25} {label:45} {wt.path}")

            if kept:
                continue
            clean = lines == []
            should_remove = (clean and args.remove_clean) or ((not clean) and args.force_dirty)
            if should_remove and args.yes:
                cmd = ["git", "--git-dir", git_dir, "worktree", "remove"]
                if not clean:
                    cmd.append("--force")
                cmd.append(wt.path)
                result = run(cmd)
                if result.returncode != 0:
                    print(f"ERROR removing {wt.path}: {result.stderr.strip()}", file=sys.stderr)
                else:
                    removed += 1

        if args.yes and (args.remove_clean or args.force_dirty):
            run(["git", "--git-dir", git_dir, "worktree", "prune"])

    if args.yes:
        print(f"Removed {removed} worktree(s).")
    else:
        print("Dry run only. Add --remove-clean --yes or --force-dirty --yes to remove candidates.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
