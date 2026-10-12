from datetime import date, timedelta
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

from merged_prs import day_bounds, extract_fhbh, fetch_prs, render_report


def pr(number=1, body="### ❤️ FHBH\n\nMade it better.\n\n### TL;DR\nOther text.",
       merger="me", merged_at="2026-10-12T18:00:00Z"):
    return {"number": number, "body": body, "mergedBy": {"login": merger},
            "mergedAt": merged_at, "repository": {"nameWithOwner": "example/app"}}


def page(nodes, more=False, cursor=None, count=5):
    return {"data": {"viewer": {"login": "Me"}, "search": {
        "issueCount": count, "nodes": nodes,
        "pageInfo": {"hasNextPage": more, "endCursor": cursor}}}}


class ReportTests(unittest.TestCase):
    def test_template_comments_and_section_boundary(self):
        body = "### ❤️ FHBH\n<!-- prompt\n### Fake\n-->\nHuman words.\n### 🤖 TL;DR\nRobot words."
        self.assertEqual(extract_fhbh(body), "Human words.")

    def test_multiline_markdown_and_nested_heading(self):
        body = "## For Humans, By Humans™\nFirst paragraph.\n\nSecond paragraph.\n### Details\n- One\n- Two\n## Testing\nSkip"
        self.assertEqual(render_report([pr(body=body)]),
                         "PR's merged\n\n- First paragraph.\n  \n  Second paragraph.\n  ### Details\n  - One\n  - Two\n")

    def test_fences_do_not_start_or_end_sections(self):
        body = "```md\n## FHBH\nFake\n```\n## FHBH\nReal\n```md\n## Inside code\n```\n## Testing\nSkip"
        self.assertEqual(extract_fhbh(body), "Real\n```md\n## Inside code\n```")

    def test_empty_and_missing_fhbh(self):
        for body in [None, "", "## Description\nText", "## FHBH\n<!-- template -->\n## Testing"]:
            self.assertEqual(render_report([pr(body=body)]),
                             "PR's merged\n\n- FHBH missing for example/app#1.\n")

    def test_no_merges(self):
        self.assertEqual(render_report([]), "PR's merged\n\n- No PRs merged.\n")

    def test_daylight_saving_boundaries(self):
        for day, hours in [(date(2026, 3, 8), 23), (date(2026, 11, 1), 25)]:
            start, end = day_bounds(day, ZoneInfo("America/Denver"))
            self.assertEqual(end - start, timedelta(hours=hours))

    @patch("merged_prs.gh_json")
    def test_pagination_merger_boundaries_deduplication_and_order(self, gh):
        start, end = day_bounds(date(2026, 10, 12), ZoneInfo("America/Denver"))
        first = pr(1, merged_at="2026-10-12T06:00:00Z")
        gh.side_effect = [page([pr(2), pr(3, merger="someone-else")], True, "next"),
                          page([first, pr(2), pr(4, merged_at="2026-10-13T06:00:00Z"),
                                pr(5, merged_at="2026-10-12T05:59:59Z"), None])]
        self.assertEqual([p["number"] for p in fetch_prs("example/app", start, end)], [1, 2])
        self.assertIn("cursor=next", gh.call_args.args)
        self.assertIn("search=repo:example/app is:pr is:merged merged:2026-10-12T06:00:00Z..2026-10-13T05:59:59Z", gh.call_args.args)

    @patch("merged_prs.gh_json", return_value=page([], count=1001))
    def test_search_limit_fails_instead_of_truncating(self, gh):
        with self.assertRaisesRegex(RuntimeError, "incomplete report"):
            fetch_prs("example/app", *day_bounds(date(2026, 10, 12), ZoneInfo("America/Denver")))


if __name__ == "__main__":
    unittest.main()
