#!/usr/bin/env python3
import argparse
from datetime import date, datetime, time, timedelta, timezone
import json
import re
import subprocess
import sys
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


QUERY = """
query($search: String!, $cursor: String) {
  viewer { login }
  search(query: $search, type: ISSUE, first: 100, after: $cursor) {
    issueCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number body mergedAt mergedBy { login }
        repository { nameWithOwner }
      }
    }
  }
}
"""


def day_bounds(day, zone):
    start = datetime.combine(day, time.min, zone).astimezone(timezone.utc)
    end = datetime.combine(day + timedelta(days=1), time.min, zone).astimezone(timezone.utc)
    return start, end


def gh_json(*args):
    result = subprocess.run(["gh", *args], capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise RuntimeError("GitHub request failed. Check gh authentication and repository access.")
    payload = json.loads(result.stdout)
    if payload.get("errors"):
        raise RuntimeError("GitHub returned GraphQL errors; no report was generated.")
    return payload


def fetch_prs(repo, start, end):
    lower = start.strftime("%Y-%m-%dT%H:%M:%SZ")
    upper = (end - timedelta(seconds=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
    search = f"repo:{repo} is:pr is:merged merged:{lower}..{upper}"
    cursor = None
    prs = {}
    while True:
        args = ["api", "graphql", "-f", f"query={QUERY}", "-f", f"search={search}"]
        if cursor:
            args += ["-f", f"cursor={cursor}"]
        data = gh_json(*args)["data"]
        login = data["viewer"]["login"].casefold()
        page = data["search"]
        if page["issueCount"] > 1000:
            raise RuntimeError("GitHub search exceeds 1,000 PRs; refusing an incomplete report.")
        for pr in page["nodes"]:
            if not pr or not pr.get("mergedAt"):
                continue
            merged_at = datetime.fromisoformat(pr["mergedAt"].replace("Z", "+00:00"))
            merger = (pr.get("mergedBy") or {}).get("login", "").casefold()
            if merger == login and start <= merged_at < end:
                key = (pr["repository"]["nameWithOwner"], pr["number"])
                prs[key] = pr
        if not page["pageInfo"]["hasNextPage"]:
            break
        next_cursor = page["pageInfo"]["endCursor"]
        if not next_cursor or next_cursor == cursor:
            raise RuntimeError("GitHub pagination stalled; no report was generated.")
        cursor = next_cursor
    return sorted(prs.values(), key=lambda pr: (pr["mergedAt"], pr["number"]))


def extract_fhbh(body):
    body = re.sub(r"<!--.*?(?:-->|\Z)", "", body or "", flags=re.DOTALL)
    level = None
    lines = []
    fence = None
    for line in body.splitlines():
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})", line)
        if fence:
            if level is not None:
                lines.append(line)
            if re.fullmatch(r" {0,3}" + re.escape(fence[0]) + "{" + str(len(fence)) + r",}\s*", line):
                fence = None
            continue
        if marker:
            fence = marker[1]
            if level is not None:
                lines.append(line)
            continue
        heading = re.match(r"^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$", line)
        if heading:
            if level is not None and len(heading[1]) <= level:
                break
            if level is None and re.search(r"\bFHBH\b|For Humans,?\s+By Humans", heading[2], re.IGNORECASE):
                level = len(heading[1])
                continue
        if level is not None:
            lines.append(line)
    return "\n".join(lines).strip()


def render_report(prs):
    bullets = []
    for pr in prs:
        section = extract_fhbh(pr.get("body"))
        if not section:
            section = f"FHBH missing for {pr['repository']['nameWithOwner']}#{pr['number']}."
        lines = section.splitlines()
        bullets.append("- " + lines[0] + "".join("\n  " + line for line in lines[1:]))
    return "PR's merged\n\n" + "\n".join(bullets or ["- No PRs merged."]) + "\n"


def main():
    parser = argparse.ArgumentParser(description="Report merged PRs using their FHBH sections.")
    parser.add_argument("--repo", default="sixfiftylabs/app", help="GitHub OWNER/REPO")
    parser.add_argument("--date", type=date.fromisoformat, help="Calendar date YYYY-MM-DD (default: today)")
    parser.add_argument("--timezone", default="America/Denver", help="IANA timezone (default: America/Denver)")
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repo):
        parser.error("--repo must be OWNER/REPO")
    try:
        zone = ZoneInfo(args.timezone)
        day = args.date or datetime.now(zone).date()
        start, end = day_bounds(day, zone)
        report = render_report(fetch_prs(args.repo, start, end))
    except (OSError, ValueError, KeyError, RuntimeError, subprocess.TimeoutExpired, ZoneInfoNotFoundError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    print(report, end="")
    return 0


if __name__ == "__main__":
    sys.exit(main())
