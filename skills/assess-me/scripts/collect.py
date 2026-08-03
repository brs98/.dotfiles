#!/usr/bin/env python3
"""Single collection entrypoint for the assess-me skill.

Runs the prompt extractor and the git miner and merges their output into one
evidence bundle, so the composing agent makes one call instead of several and
the collection mechanics stay out of the main transcript.

Local only — delegates to extract_prompts.py and git_stats.py (git + local
files, no network). Python 3 standard library only.

Usage:
  collect.py [--host auto|claude|codex|cursor|opencode|pi] [--last N]
             [--since YYYY-MM-DD] [--repos PATH [PATH ...]] [--out FILE]
"""
import argparse, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))

def run(script, args):
    out = os.path.join(tempfile.gettempdir(), f"assess-{script}.json")
    proc = subprocess.run(["python3", os.path.join(HERE, script), *args, "--out", out],
                          capture_output=True, text=True)
    if proc.returncode != 0:
        sys.stderr.write(f"{script} failed: {proc.stderr}\n")
        return {}
    try:
        return json.load(open(out))
    except Exception as e:
        sys.stderr.write(f"{script}: could not read {out}: {e}\n")
        return {}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="auto")
    ap.add_argument("--last", type=int, default=20)
    ap.add_argument("--since", default=None)
    ap.add_argument("--repos", nargs="+", default=["."])
    ap.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "assess-evidence.json"))
    a = ap.parse_args()

    ep = ["--host", a.host, "--last", str(a.last)] + (["--since", a.since] if a.since else [])
    prompts = run("extract_prompts.py", ep)

    gs = ["--repos", *a.repos] + (["--since", a.since] if a.since else [])
    git = run("git_stats.py", gs)

    open(a.out, "w").write(json.dumps({"prompts": prompts, "git": git}, indent=2))

    hosts = prompts.get("hosts", [])
    repos = ", ".join(r.get("repo", "?") for r in git.get("repos", []))
    print(f"hosts: {hosts or 'none'}  prompts: {prompts.get('n_prompts', 0)}  "
          f"repos: {repos or 'none'}  → {a.out}")

if __name__ == "__main__":
    main()
