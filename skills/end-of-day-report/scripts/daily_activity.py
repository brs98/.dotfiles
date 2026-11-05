#!/usr/bin/env python3
"""Collect one day's SixFifty work activity as JSON for the end-of-day report."""
import argparse
from datetime import date, datetime, timezone
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from merged_prs import day_bounds, extract_fhbh

HOME = Path.home()
WORK_ROOT = HOME / "work" / "sixfifty"
CLAUDE_PROJECTS = HOME / ".claude" / "projects"
CODEX_STATE = HOME / ".codex" / "state_5.sqlite"
SHORTCUT = HOME / ".agents" / "skills" / "shortcut-sixfifty" / "scripts" / "shortcut-sixfifty.py"
PROMPT_LIMIT = 240
PROMPTS_PER_SESSION = 6
REPORT_COMMAND = "end-of-day-report"

PR_QUERY = """
query($search: String!, $cursor: String) {
  viewer { login }
  search(query: $search, type: ISSUE, first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title url state isDraft createdAt mergedAt body
        author { login } mergedBy { login } repository { nameWithOwner }
        reviews(last: 100) { nodes { author { login } submittedAt state } }
        comments(last: 100) { nodes { author { login } createdAt } }
        commits(last: 100) { nodes { commit { committedDate author { user { login } } } } }
        timelineItems(last: 20, itemTypes: [READY_FOR_REVIEW_EVENT]) {
          nodes { ... on ReadyForReviewEvent { createdAt actor { login } } }
        }
      }
    }
  }
}
"""


def parse_time(value):
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000 if value > 1e11 else value, timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def in_range(value, start, end):
    try:
        return value is not None and start <= parse_time(value) < end
    except (TypeError, ValueError):
        return False


def under_work_root(path):
    try:
        return Path(path).resolve().is_relative_to(WORK_ROOT.resolve())
    except (OSError, ValueError, TypeError):
        return False


def short_path(path):
    try:
        return str(Path(path).resolve().relative_to(WORK_ROOT.resolve()))
    except (OSError, ValueError):
        return str(path)


def clip(text):
    text = re.sub(r"<pasted_content\b.*?(?:</pasted_content>|\Z)", "[pasted text]", text, flags=re.DOTALL)
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= PROMPT_LIMIT else text[: PROMPT_LIMIT - 1] + "…"


def prompt_text(record):
    """Return what the human typed in a transcript record, or None for tool/system traffic."""
    if record.get("type") != "user" or any(record.get(flag) for flag in
                                            ("isMeta", "isSidechain", "isCompactSummary", "isVisibleInTranscriptOnly")):
        return None
    content = (record.get("message") or {}).get("content")
    if isinstance(content, list):
        if any(isinstance(p, dict) and p.get("type") == "tool_result" for p in content):
            return None
        content = "\n".join(p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text")
    if not isinstance(content, str) or not content.strip():
        return None
    command = re.search(r"<command-name>/?([^<]+)</command-name>", content)
    if command:
        args = re.search(r"<command-args>(.*?)</command-args>", content, re.DOTALL)
        return "/" + command[1].strip() + (" " + args[1].strip() if args and args[1].strip() else "")
    if content.lstrip().startswith(("<", "[Request interrupted", "Caveat:")):
        return None
    return content


def parse_claude_session(lines, start, end):
    session = {"title": None, "cwds": set(), "branches": set(), "prompts": [], "prs": set(),
               "first": None, "last": None}
    for line in lines:
        try:
            record = json.loads(line)
        except ValueError:
            continue
        kind = record.get("type")
        if kind in ("ai-title", "custom-title"):
            session["title"] = record.get("customTitle") or record.get("aiTitle") or record.get("title") \
                or session["title"]
            continue
        stamp = record.get("timestamp")
        if not in_range(stamp, start, end):
            continue
        if kind == "pr-link" and record.get("prUrl"):
            session["prs"].add(record["prUrl"])
        text = prompt_text(record)
        if text is None:
            continue
        if record.get("cwd"):
            session["cwds"].add(record["cwd"])
        if record.get("gitBranch") and record["gitBranch"] != "HEAD":
            session["branches"].add(record["gitBranch"])
        session["prompts"].append(text)
        session["first"] = session["first"] or stamp
        session["last"] = stamp
    return session


def informative_prompts(prompts):
    clipped = [clip(p) for p in prompts]
    keep = sorted(sorted(range(len(clipped)), key=lambda i: -len(clipped[i]))[:PROMPTS_PER_SESSION])
    return [clipped[i] for i in keep]


def is_report_only(prompts):
    return all(p.startswith("/" + REPORT_COMMAND) for p in prompts)


def collect_claude_sessions(start, end):
    sessions = []
    for path in sorted(CLAUDE_PROJECTS.glob("*/*.jsonl")):
        if datetime.fromtimestamp(path.stat().st_mtime, timezone.utc) < start:
            continue
        with path.open(encoding="utf-8", errors="replace") as handle:
            session = parse_claude_session(handle, start, end)
        cwds = [c for c in session["cwds"] if under_work_root(c)]
        if not session["prompts"] or not cwds or is_report_only(session["prompts"]):
            continue
        sessions.append({
            "id": path.stem,
            "title": session["title"],
            "dirs": sorted({short_path(c) for c in cwds}),
            "branches": sorted(session["branches"]),
            "started": session["first"],
            "ended": session["last"],
            "prompt_count": len(session["prompts"]),
            "prompts": informative_prompts(session["prompts"]),
            "prs_linked": sorted(session["prs"]),
        })
    return sorted(sessions, key=lambda s: s["started"])


def collect_codex_threads(start, end):
    if not CODEX_STATE.exists():
        return []
    start_ms, end_ms = int(start.timestamp() * 1000), int(end.timestamp() * 1000)
    connection = sqlite3.connect(f"file:{CODEX_STATE}?mode=ro", uri=True, timeout=5)
    try:
        rows = connection.execute(
            """SELECT title, name, cwd, git_branch, first_user_message,
                      COALESCE(created_at_ms, created_at * 1000), COALESCE(updated_at_ms, updated_at * 1000)
               FROM threads
               WHERE thread_source = 'user' AND source IN ('cli', 'vscode') AND has_user_event = 1
                 AND COALESCE(updated_at_ms, updated_at * 1000) >= ?
                 AND COALESCE(created_at_ms, created_at * 1000) < ?
               ORDER BY 6""",
            (start_ms, end_ms),
        ).fetchall()
    finally:
        connection.close()
    return [{"title": name or title, "dir": short_path(cwd), "branch": branch,
             "first_prompt": clip(first or ""), "started": parse_time(created).isoformat()}
            for title, name, cwd, branch, first, created, _ in rows if under_work_root(cwd)]


def git(repo, *args):
    result = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError(f"git failed in {repo.name}: {result.stderr.strip()[:200]}")
    return result.stdout


def branch_name(ref):
    return re.sub(r"^refs/(heads|remotes/[^/]+)/", "", ref)


def group_commits(repo_name, log_output, start, end):
    groups, seen = {}, set()
    for line in log_output.splitlines():
        sha, authored, ref, subject = (line.split("\x1f") + ["", "", "", ""])[:4]
        if not sha or sha in seen or not in_range(authored, start, end):
            continue
        seen.add(sha)
        branch = branch_name(ref)
        group = groups.setdefault(branch, {"repo": repo_name, "branch": branch, "commits": []})
        group["commits"].append({"sha": sha[:10], "authored": authored, "subject": subject})
    for group in groups.values():
        group["commits"].sort(key=lambda c: c["authored"])
    return list(groups.values())


def collect_commits(start, end):
    groups = []
    for repo in sorted(p for p in WORK_ROOT.iterdir() if (p / ".git").exists()):
        email = git(repo, "config", "user.email").strip()
        if not email:
            continue
        log = git(repo, "log", "--exclude=refs/stash", "--all", "--no-merges", "--source",
                  f"--since={start.isoformat()}", f"--author={email}",
                  "--format=%H%x1f%aI%x1f%S%x1f%s")
        groups += group_commits(repo.name, log, start, end)
    return groups


def gh_graphql(search, cursor=None):
    args = ["gh", "api", "graphql", "--hostname", "github.com", "-f", f"query={PR_QUERY}", "-f", f"search={search}"]
    if cursor:
        args += ["-f", f"cursor={cursor}"]
    result = subprocess.run(args, capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise RuntimeError("GitHub request failed. Check gh authentication and repository access.")
    payload = json.loads(result.stdout)
    if payload.get("errors"):
        raise RuntimeError("GitHub returned GraphQL errors.")
    return payload["data"]


def is_login(node, login):
    return ((node or {}).get("login") or "").casefold() == login


def classify_pr(pr, login, start, end):
    mine = is_login(pr.get("author"), login)
    actions = []
    if mine and in_range(pr.get("createdAt"), start, end):
        actions.append("opened" + (" as draft" if pr.get("isDraft") else ""))
    pushed = sum(1 for n in pr["commits"]["nodes"]
                 if is_login((n["commit"]["author"] or {}).get("user"), login)
                 and in_range(n["commit"]["committedDate"], start, end))
    if pushed:
        actions.append(f"pushed {pushed} commit{'s' if pushed > 1 else ''}")
    reviews = [r for r in pr["reviews"]["nodes"] if is_login(r.get("author"), login)
               and in_range(r.get("submittedAt"), start, end)]
    if reviews and mine:
        actions.append("replied to review threads")
    elif reviews:
        states = sorted({r["state"].lower().replace("_", " ") for r in reviews})
        actions.append("reviewed (" + ", ".join(states) + ")")
    if any(is_login(c.get("author"), login) and in_range(c.get("createdAt"), start, end)
           for c in pr["comments"]["nodes"]):
        actions.append("commented")
    if any(is_login(e.get("actor"), login) and in_range(e.get("createdAt"), start, end)
           for e in (pr.get("timelineItems") or {}).get("nodes", [])):
        actions.append("marked ready for review")
    if is_login(pr.get("mergedBy"), login) and in_range(pr.get("mergedAt"), start, end):
        actions.append("merged")
    if not actions:
        return None
    group = report_group(pr, mine, actions)
    item = {"repo": pr["repository"]["nameWithOwner"], "number": pr["number"], "title": pr["title"],
            "url": pr["url"], "state": "DRAFT" if pr.get("isDraft") and pr["state"] == "OPEN" else pr["state"],
            "authored_by_me": mine, "group": group, "actions": actions}
    if group in ("ready_for_review", "draft"):
        item["fhbh"] = extract_fhbh(pr.get("body")) or None
    return item


def report_group(pr, mine, actions):
    if "merged" in actions:
        return "merged"
    if mine and pr["state"] == "OPEN" and pr.get("isDraft"):
        return "draft"
    if mine and pr["state"] == "OPEN" and ("marked ready for review" in actions or "opened" in actions):
        return "ready_for_review"
    return "work_in_progress"


def collect_github(start, end):
    lower = start.strftime("%Y-%m-%dT%H:%M:%SZ")
    found, login = {}, None
    for who in ("involves:@me", "reviewed-by:@me"):
        cursor = None
        for _ in range(10):
            data = gh_graphql(f"org:sixfiftylabs is:pr {who} updated:>={lower}", cursor)
            login = data["viewer"]["login"].casefold()
            for pr in data["search"]["nodes"]:
                if pr and pr.get("number"):
                    found[(pr["repository"]["nameWithOwner"], pr["number"])] = pr
            page = data["search"]["pageInfo"]
            if not page["hasNextPage"]:
                break
            cursor = page["endCursor"]
        else:
            raise RuntimeError("GitHub activity exceeds 500 PRs; refusing a partial list.")
    items = [classify_pr(pr, login, start, end) for pr in found.values()]
    return sorted((i for i in items if i), key=lambda i: (i["repo"], i["number"]))


def shortcut_call(tool, arguments):
    with tempfile.TemporaryDirectory() as scratch:
        args_file = Path(scratch) / "args.json"
        args_file.write_text(json.dumps(arguments))
        result = subprocess.run([sys.executable, str(SHORTCUT), "call-tool", tool,
                                 "--arguments-file", str(args_file), "--json"],
                                capture_output=True, text=True, timeout=120)
    if result.returncode:
        raise RuntimeError(f"Shortcut {tool} failed; check the shortcut-sixfifty launcher.")
    if result.stdout.strip().startswith("Result: No "):
        return {}, None
    match = re.search(r"next_page_token:\s*(\S+)", result.stderr)
    return json.loads(result.stdout), match[1] if match else None


def workflow_states(payload):
    return {state["id"]: state["name"]
            for workflow in ((payload.get("relatedEntities") or {}).get("workflows") or {}).values()
            for state in workflow.get("states", [])}


def shortcut_search(arguments):
    stories, states, token = {}, {}, None
    for _ in range(10):
        payload, token = shortcut_call("stories-search", {**arguments, **({"nextPageToken": token} if token else {})})
        states.update(workflow_states(payload))
        stories.update({story["id"]: story for story in payload.get("stories", [])})
        if not token:
            return stories, states
    raise RuntimeError("Shortcut search exceeded 10 pages; refusing a partial list.")


def my_story_actions(history, me, states, start, end):
    actions = []
    for entry in history:
        if entry.get("actor_id") != me or not in_range(entry.get("changed_at"), start, end):
            continue
        for action in entry.get("actions", []):
            kind, verb = action.get("entity_type", "story"), action.get("action")
            changes = action.get("changes") or {}
            if kind == "story" and verb == "create":
                actions.append("created the story")
            elif kind == "story-comment" and verb == "create":
                actions.append("commented")
            elif "workflow_state_id" in changes:
                state = changes["workflow_state_id"].get("new")
                actions.append(f"moved to {states.get(state, state)}")
            elif kind == "story" and verb == "update" and set(changes) & {"description", "name"}:
                actions.append("edited the description")
            elif kind == "task" and verb in ("create", "update"):
                actions.append(f"{'added' if verb == 'create' else 'updated'} a task")
    return list(dict.fromkeys(actions))


def collect_shortcut(day, extra_ids, start, end):
    me = shortcut_call("users-get-current", {})[0]["id"]
    window = f"{day.isoformat()}..{date.fromordinal(day.toordinal() + 1).isoformat()}"
    candidates, states = {}, {}
    for arguments in ({"owner": "me", "updated": window}, {"requester": "me", "created": window}):
        found, found_states = shortcut_search(arguments)
        candidates.update(found)
        states.update(found_states)
    for story_id in sorted(set(extra_ids) - set(candidates)):
        payload, _ = shortcut_call("stories-get-by-id", {"storyPublicId": story_id})
        states.update(workflow_states(payload))
        story = payload.get("story") or payload
        if story.get("id"):
            candidates[story["id"]] = story
    stories = []
    for story_id, story in sorted(candidates.items()):
        history = shortcut_call("stories-get-history", {"storyPublicId": story_id})[0].get("history", [])
        actions = my_story_actions(history, me, states, start, end)
        if actions:
            stories.append({"id": story_id, "name": story.get("name"), "url": story.get("app_url"),
                            "state": states.get(story.get("workflow_state_id")), "my_actions": actions})
    return stories


def story_ids(*texts):
    return {int(n) for text in texts for n in re.findall(r"\bsc-(\d+)", text or "", re.IGNORECASE)}


def referenced_stories(report):
    texts = [b for s in report.get("claude_sessions") or [] for b in s["branches"]]
    texts += [t.get("branch") for t in report.get("codex_threads") or []]
    texts += [g["branch"] for g in report.get("commits") or []]
    texts += [p["title"] for p in report.get("github_prs") or []]
    return story_ids(*texts)


def main():
    parser = argparse.ArgumentParser(description="Collect a day's SixFifty work activity as JSON.")
    parser.add_argument("--date", type=date.fromisoformat, help="Calendar date YYYY-MM-DD (default: today)")
    parser.add_argument("--timezone", default="America/Denver", help="IANA timezone (default: America/Denver)")
    args = parser.parse_args()
    try:
        zone = ZoneInfo(args.timezone)
    except ZoneInfoNotFoundError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    day = args.date or datetime.now(zone).date()
    start, end = day_bounds(day, zone)
    report = {"date": day.isoformat(), "timezone": args.timezone, "errors": []}
    sources = {
        "claude_sessions": lambda: collect_claude_sessions(start, end),
        "codex_threads": lambda: collect_codex_threads(start, end),
        "commits": lambda: collect_commits(start, end),
        "github_prs": lambda: collect_github(start, end),
        "shortcut_stories": lambda: collect_shortcut(day, referenced_stories(report), start, end),
    }
    for name, collect in sources.items():
        try:
            report[name] = collect()
        except (OSError, ValueError, KeyError, TypeError, RuntimeError, sqlite3.Error,
                subprocess.TimeoutExpired) as error:
            report[name] = None
            report["errors"].append({"source": name, "error": str(error)[:300]})
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
