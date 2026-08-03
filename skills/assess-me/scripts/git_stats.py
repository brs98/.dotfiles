#!/usr/bin/env python3
"""Contributor statistics for the assess-me skill.

Runs `git` locally only — no network. Python 3 standard library only.
Keyed on the git identity (email) unless --author is given.

Usage:
  git_stats.py [--since "12 months ago"] [--author <name-or-email>]
               [--repos PATH [PATH ...]] [--out FILE]

Reports, per repo and combined: total commits in the window by the author,
the author's rank among all contributors, code-vs-docs file-touch ratio,
and commit cadence (active days, span, commits/active-day).
"""
import argparse, json, os, subprocess, collections, sys

CODE_EXT = {"rb","py","js","jsx","ts","tsx","go","java","rs","ex","exs","rb",
            "c","h","cpp","cc","hpp","cs","php","swift","kt","scala","clj",
            "sql","sh","bash","erb","slim","haml","vue","css","scss"}
DOC_EXT = {"md","markdown","txt","rst","adoc"}

def git(repo, *args):
    try:
        out = subprocess.run(["git", "-C", repo, *args],
                             capture_output=True, text=True, timeout=60)
        return out.stdout if out.returncode == 0 else ""
    except Exception:
        return ""

def is_repo(repo):
    return git(repo, "rev-parse", "--is-inside-work-tree").strip() == "true"

def analyze(repo, since, author):
    ident = author or git(repo, "config", "user.email").strip() or "(unknown)"
    # window commit author emails (for ranking + totals)
    emails = [e for e in git(repo, "log", f"--since={since}", "--no-merges",
                             "--format=%ae").splitlines() if e]
    ranking = collections.Counter(emails)
    ordered = ranking.most_common()
    mine = ranking.get(ident, 0)
    rank = next((i + 1 for i, (e, _) in enumerate(ordered) if e == ident), None)
    # this author's commits: file-touch classification + dates
    log = git(repo, "log", f"--since={since}", "--no-merges",
              f"--author={ident}", "--name-only", "--format=__%ad__", "--date=short")
    code = docs = other = 0
    dates = set()
    dirs = collections.Counter()
    for line in log.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("__") and line.endswith("__"):
            dates.add(line.strip("_"))
            continue
        dirs[line.split("/", 1)[0] if "/" in line else "(root)"] += 1
        ext = line.rsplit(".", 1)[-1].lower() if "." in line else ""
        if ext in CODE_EXT:
            code += 1
        elif ext in DOC_EXT:
            docs += 1
        else:
            other += 1
    touches = code + docs + other
    active_days = len(dates)
    span = ""
    if dates:
        span = f"{min(dates)} .. {max(dates)}"
    # subject + body per commit, ASCII unit/record separators so multi-line
    # bodies survive parsing; body carries the "why" a bare subject omits.
    raw = git(repo, "log", f"--since={since}", "--no-merges",
              f"--author={ident}", "--format=%s%x1f%b%x1e")
    commits = []
    for rec in raw.split("\x1e"):
        rec = rec.strip()
        if not rec:
            continue
        subj, _, body = rec.partition("\x1f")
        subj = subj.strip()
        if subj:
            commits.append({"subject": subj, "body": " ".join(body.split())[:280]})
    subjects = [c["subject"] for c in commits]
    return {
        "repo": os.path.basename(os.path.abspath(repo)),
        "identity": ident,
        "commits": mine,
        "rank": rank,
        "total_contributors": len(ordered),
        "total_commits_in_window": sum(ranking.values()),
        "file_touches": {"code": code, "docs": docs, "other": other, "total": touches},
        "code_pct": round(100 * code / touches) if touches else None,
        "docs_pct": round(100 * docs / touches) if touches else None,
        "active_days": active_days,
        "commits_per_active_day": round(mine / active_days, 1) if active_days else None,
        "span": span,
        "recent_subjects": subjects[:40],
        "recent_commits": commits[:25],
        "top_paths": [{"path": p, "touches": n} for p, n in dirs.most_common(12)],
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="12 months ago")
    ap.add_argument("--author", default=None)
    ap.add_argument("--repos", nargs="+", default=["."])
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    repos = [r for r in a.repos if is_repo(r)]
    skipped = [r for r in a.repos if r not in repos]
    stats = [analyze(r, a.since, a.author) for r in repos]
    result = {"since": a.since, "repos": stats, "skipped_not_a_repo": skipped}

    payload = json.dumps(result, indent=2)
    if a.out:
        open(a.out, "w").write(payload)
    else:
        print(payload)
    for s in stats:
        rank = f"#{s['rank']} of {s['total_contributors']}" if s["rank"] else "unranked"
        print(f"{s['repo']}: {s['commits']} commits ({rank}), "
              f"{s['code_pct']}% code / {s['docs_pct']}% docs touches, "
              f"{s['active_days']} active days ({s['span']})", file=sys.stderr)
    if skipped:
        print(f"skipped (not a git repo): {skipped}", file=sys.stderr)

if __name__ == "__main__":
    main()
