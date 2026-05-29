import assert from "node:assert/strict";

import {
  formatPlannerBlockedSummary,
  parsePlannerPlan,
} from "../planner-output.mjs";

const candidates = [
  { id: "repo-abc", title: "fix(auth): stale token", status: "ready_for_agent" },
  { id: "repo-def", title: "feat(ui): new panel", status: "ready_for_agent" },
];

{
  const decision = parsePlannerPlan(
    '<plan>{"issues": []}</plan>',
    {
      candidates,
      openPrs: [{ number: 42, headRefName: "picastle/repo-abc-stale-token", url: "https://github.com/acme/repo/pull/42" }],
    },
  );

  assert.equal(decision.issues.length, 0);
  assert.equal(decision.skipped.length, 2);
  assert.equal(decision.skipped[0]?.id, "repo-abc");
  assert.equal(decision.skipped[0]?.category, "existing_pr");
  assert.match(decision.skipped[0]?.reason ?? "", /#42/);
  assert.equal(decision.skipped[1]?.id, "repo-def");
  assert.equal(decision.skipped[1]?.category, "missing_context");
  assert.equal(decision.hasSyntheticExplanations, true);

  const summary = formatPlannerBlockedSummary(decision).join("\n");
  assert.match(summary, /Planner considered 2 candidate\(s\); selected 0, skipped 2\./);
  assert.match(summary, /existing PR: 1/);
  assert.match(summary, /missing context: 1/);
  assert.doesNotMatch(summary, /issues: \[\]/);
}

{
  const decision = parsePlannerPlan(
    `<plan>{
      "issues": [{"id":"repo-def","title":"feat(ui): new panel","branch":"sandcastle/repo-def-panel"}],
      "blocked": [{"id":"repo-abc","title":"fix(auth): stale token","category":"overlap_risk","reason":"touches auth files in PR #42","blockers":["PR #42"]}]
    }</plan>`,
    { candidates, openPrs: [] },
  );

  assert.deepEqual(decision.issues, [
    { id: "repo-def", title: "feat(ui): new panel", branch: "picastle/repo-def-panel" },
  ]);
  assert.equal(decision.skipped.length, 1);
  assert.equal(decision.skipped[0]?.category, "overlap_risk");
  assert.deepEqual(decision.skipped[0]?.blockers, ["PR #42"]);
}

console.log("planner-output tests passed");
