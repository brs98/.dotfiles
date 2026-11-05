from datetime import date
import json
import unittest
from zoneinfo import ZoneInfo

from daily_activity import classify_pr, clip, group_commits, informative_prompts, is_report_only, \
    my_story_actions, parse_claude_session, prompt_text, story_ids
from merged_prs import day_bounds

START, END = day_bounds(date(2026, 11, 4), ZoneInfo("America/Denver"))
INSIDE, BEFORE = "2026-11-04T18:00:00Z", "2026-11-04T06:59:59Z"


def user(content, stamp=INSIDE, **extra):
    return {"type": "user", "timestamp": stamp, "cwd": "/w/app", "gitBranch": "feature",
            "message": {"content": content}, **extra}


def pr(**overrides):
    base = {"number": 7, "title": "T", "url": "u", "state": "OPEN", "isDraft": False,
            "createdAt": BEFORE, "mergedAt": None, "author": {"login": "Other"}, "mergedBy": None,
            "repository": {"nameWithOwner": "sixfiftylabs/app"},
            "reviews": {"nodes": []}, "comments": {"nodes": []}, "commits": {"nodes": []}}
    return {**base, **overrides}


class PromptTests(unittest.TestCase):
    def test_keeps_human_text_and_commands_only(self):
        self.assertEqual(prompt_text(user("fix the bug")), "fix the bug")
        self.assertEqual(prompt_text(user([{"type": "text", "text": "hi"}])), "hi")
        self.assertEqual(prompt_text(user("<command-name>/review</command-name><command-args>4684</command-args>")),
                         "/review 4684")
        for skipped in [user([{"type": "tool_result", "content": "x"}]), user("<system-reminder>x"),
                        user("x", isMeta=True), user("x", isSidechain=True), {"type": "assistant"}]:
            self.assertIsNone(prompt_text(skipped))

    def test_clip_drops_pasted_content_and_truncates(self):
        self.assertEqual(clip('explain <pasted_content id="a">secret\nstuff</pasted_content> please'),
                         "explain [pasted text] please")
        self.assertEqual(len(clip("x" * 1000)), 240)

    def test_informative_prompts_keep_order(self):
        prompts = ["yes", "a much longer prompt", "ok", "medium one"] + ["y"] * 5
        self.assertEqual(informative_prompts(prompts)[:3], ["yes", "a much longer prompt", "ok"])
        self.assertEqual(len(informative_prompts(prompts)), 6)

    def test_report_only_sessions(self):
        self.assertTrue(is_report_only(["/end-of-day-report"]))
        self.assertFalse(is_report_only(["/end-of-day-report", "now update the skill"]))


class SessionTests(unittest.TestCase):
    def test_parses_only_records_inside_the_day(self):
        lines = [json.dumps(r) for r in [
            user("yesterday", BEFORE),
            {"type": "ai-title", "aiTitle": "Old"},
            user("today"),
            {"type": "pr-link", "timestamp": INSIDE, "prUrl": "https://github.com/x/pull/1"},
            {"type": "ai-title", "aiTitle": "New"},
        ]] + ["not json"]
        session = parse_claude_session(lines, START, END)
        self.assertEqual(session["prompts"], ["today"])
        self.assertEqual(session["title"], "New")
        self.assertEqual(session["prs"], {"https://github.com/x/pull/1"})
        self.assertEqual(session["branches"], {"feature"})


class CommitTests(unittest.TestCase):
    def test_groups_by_branch_dedupes_and_filters_author_date(self):
        log = "\n".join([
            "a1\x1f2026-11-04T10:00:00-07:00\x1frefs/heads/feat\x1fSecond",
            "a1\x1f2026-11-04T10:00:00-07:00\x1frefs/remotes/origin/feat\x1fSecond",
            "a0\x1f2026-11-04T09:00:00-07:00\x1frefs/remotes/origin/feat\x1fFirst",
            "z9\x1f2026-11-03T09:00:00-07:00\x1frefs/heads/feat\x1fRebased old work",
        ])
        self.assertEqual(group_commits("app", log, START, END), [{"repo": "app", "branch": "feat", "commits": [
            {"sha": "a0", "authored": "2026-11-04T09:00:00-07:00", "subject": "First"},
            {"sha": "a1", "authored": "2026-11-04T10:00:00-07:00", "subject": "Second"}]}])


class PullRequestTests(unittest.TestCase):
    def test_untouched_pr_is_dropped(self):
        self.assertIsNone(classify_pr(pr(comments={"nodes": [{"author": {"login": "me"}, "createdAt": BEFORE}]}),
                                      "me", START, END))

    def test_own_pr_actions(self):
        item = classify_pr(pr(author={"login": "Me"}, createdAt=INSIDE, isDraft=True, mergedBy={"login": "me"},
                              mergedAt=INSIDE,
                              commits={"nodes": [{"commit": {"committedDate": INSIDE,
                                                             "author": {"user": {"login": "me"}}}}] * 2},
                              reviews={"nodes": [{"author": {"login": "me"}, "submittedAt": INSIDE,
                                                  "state": "COMMENTED"}]},
                              timelineItems={"nodes": [{"actor": {"login": "me"}, "createdAt": INSIDE}]}),
                           "me", START, END)
        self.assertEqual(item["actions"], ["opened as draft", "pushed 2 commits", "replied to review threads",
                                           "marked ready for review", "merged"])
        self.assertEqual(item["state"], "DRAFT")
        self.assertEqual(item["group"], "merged")
        self.assertTrue(item["authored_by_me"])

    def test_report_groups(self):
        mine = {"author": {"login": "me"}, "body": "## FHBH\nHuman words.\n## TL;DR\nx"}
        opened = {"createdAt": INSIDE}
        ready_event = {"timelineItems": {"nodes": [{"actor": {"login": "me"}, "createdAt": INSIDE}]}}
        pushed = {"commits": {"nodes": [{"commit": {"committedDate": INSIDE, "author": {"user": {"login": "me"}}}}]}}
        cases = [
            ({**mine, **opened, "isDraft": True}, "draft", "Human words."),
            ({**mine, **pushed, "isDraft": True, "body": ""}, "draft", None),
            ({**mine, **opened}, "ready_for_review", "Human words."),
            ({**mine, **ready_event}, "ready_for_review", "Human words."),
            ({**mine, **pushed}, "work_in_progress", None),
            ({**pushed}, "work_in_progress", None),
        ]
        for overrides, group, fhbh in cases:
            item = classify_pr(pr(**overrides), "me", START, END)
            self.assertEqual((item["group"], item.get("fhbh")), (group, fhbh), overrides)

    def test_review_of_someone_elses_pr(self):
        item = classify_pr(pr(reviews={"nodes": [
            {"author": {"login": "me"}, "submittedAt": INSIDE, "state": "CHANGES_REQUESTED"},
            {"author": {"login": "me"}, "submittedAt": INSIDE, "state": "APPROVED"},
            {"author": {"login": "other"}, "submittedAt": INSIDE, "state": "APPROVED"}]},
            comments={"nodes": [{"author": {"login": "me"}, "createdAt": INSIDE}]}), "me", START, END)
        self.assertEqual(item["actions"], ["reviewed (approved, changes requested)", "commented"])
        self.assertEqual(item["group"], "work_in_progress")


class ShortcutTests(unittest.TestCase):
    def test_keeps_only_my_actions_inside_the_day(self):
        history = [
            {"actor_id": "me", "changed_at": INSIDE, "actions": [
                {"entity_type": "story", "action": "update", "changes": {"workflow_state_id": {"new": 31}}},
                {"entity_type": "story-comment", "action": "create"},
                {"entity_type": "story-comment", "action": "create"}]},
            {"actor_id": "teammate", "changed_at": INSIDE, "actions": [
                {"entity_type": "story-comment", "action": "create"}]},
            {"actor_id": "me", "changed_at": BEFORE, "actions": [{"entity_type": "story", "action": "create"}]},
            {"changed_at": INSIDE, "actions": [{"entity_type": "story", "action": "update",
                                                "changes": {"iteration_id": {"new": 1}}}]},
        ]
        self.assertEqual(my_story_actions(history, "me", {31: "PR Review"}, START, END),
                         ["moved to PR Review", "commented"])

    def test_story_ids_from_branches_and_titles(self):
        self.assertEqual(story_ids("brandonsouthwick/sc-25790/partner-mcp", "Fix [sc-25238]", None, "main"),
                         {25790, 25238})


if __name__ == "__main__":
    unittest.main()
