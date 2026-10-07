#!/usr/bin/env python3
"""Check whether a block of code moved unchanged.

Usage:
  compare.py [--repo DIR] [--exact] [--ignore REGEX ...] OLD NEW

OLD and NEW are REF:PATH[:START-END]. An empty REF (":path:10-20") reads the working
tree. By default lines are compared with indentation and runs of whitespace collapsed and
blank lines dropped; --exact compares raw lines. --ignore drops lines matching a regex
(e.g. comments: --ignore '^\\s*//').

Prints IDENTICAL or the number of differing lines plus a unified diff. Exit status:
0 identical, 1 different, 2 usage/IO error.
"""
import argparse
import difflib
import re
import subprocess
import sys
from pathlib import Path

RANGE_RE = re.compile(r"^(\d+)(?:-(\d+))?$")


def parse_spec(spec):
    ref, _, rest = spec.partition(":")
    if not rest:
        raise ValueError(f"{spec!r}: expected REF:PATH[:START-END]")
    path, start, end = rest, None, None
    head, sep, tail = rest.rpartition(":")
    if sep and RANGE_RE.match(tail):
        m = RANGE_RE.match(tail)
        path, start = head, int(m.group(1))
        end = int(m.group(2) or m.group(1))
    return ref, path, start, end


def read_lines(repo, ref, path):
    if ref:
        res = subprocess.run(["git", "-C", repo, "show", f"{ref}:{path}"], capture_output=True)
        if res.returncode != 0:
            raise OSError(res.stderr.decode(errors="replace").strip())
        return res.stdout.decode(errors="replace").splitlines()
    return (Path(repo) / path).read_text(encoding="utf-8", errors="replace").splitlines()


def load(repo, spec, exact, ignores):
    ref, path, start, end = parse_spec(spec)
    lines = read_lines(repo, ref, path)
    if start is not None:
        if start < 1 or end < start or end > len(lines):
            raise ValueError(f"{spec!r}: range outside the file ({len(lines)} lines)")
        lines = lines[start - 1:end]
    out = []
    for line in lines:
        if any(rx.search(line) for rx in ignores):
            continue
        if not exact:
            line = " ".join(line.split())
            if not line:
                continue
        out.append(line)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("old")
    ap.add_argument("new")
    ap.add_argument("--repo", default=".")
    ap.add_argument("--exact", action="store_true")
    ap.add_argument("--ignore", action="append", default=[])
    args = ap.parse_args()
    try:
        ignores = [re.compile(p) for p in args.ignore]
        a = load(args.repo, args.old, args.exact, ignores)
        b = load(args.repo, args.new, args.exact, ignores)
    except (OSError, ValueError, re.error) as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    if a == b:
        print(f"IDENTICAL ({len(a)} compared lines)")
        return 0
    diff = list(difflib.unified_diff(a, b, args.old, args.new, lineterm="", n=1))
    removed = sum(1 for d in diff if d.startswith("-") and not d.startswith("---"))
    added = sum(1 for d in diff if d.startswith("+") and not d.startswith("+++"))
    print(f"DIFFERENT: {removed} line(s) only in old, {added} only in new ({len(a)} vs {len(b)} compared lines)")
    print("\n".join(diff))
    return 1


if __name__ == "__main__":
    sys.exit(main())
