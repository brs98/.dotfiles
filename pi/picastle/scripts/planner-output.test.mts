import assert from "node:assert/strict";

import {
  formatPlannerBlockedSummary,
  parsePlannerContext,
  parsePlannerPlan,
} from "../planner-output.mjs";

const candidates = [
  { id: "repo-abc", title: "fix(auth): stale token", status: "ready_for_agent" },
  { id: "repo-def", title: "feat(ui): new panel", status: "ready_for_agent" },
];
const candidatesWithThird = [
  ...candidates,
  { id: "repo-ghi", title: "chore(api): cleanup", status: "ready_for_agent" },
];

// planIssues lives in main.mts, whose top-level daemon loop runs on import.
// Instead of importing it in tests, cover the shared context parser that planIssues
// calls before rendering the planner prompt or writing the audit artifact.
{
  assert.deepEqual(
    parsePlannerContext({
      candidates: [{ id: "repo-no-title", status: "ready_for_agent" }],
      openPrs: [{ number: "42", headRefName: "sandcastle/repo-no-title-fix", url: null }],
    }),
    {
      candidates: [{ id: "repo-no-title", title: "repo-no-title" }],
      openPrs: [{ number: "42", headRefName: "sandcastle/repo-no-title-fix" }],
    },
  );

  assert.throws(
    () => parsePlannerContext({ candidates: [{ id: "repo-abc", title: 123 }], openPrs: [] }),
    /Invalid candidate issue title for repo-abc/,
  );

  assert.throws(
    () =>
      parsePlannerContext({
        candidates,
        openPrs: [{ number: { value: 42 }, headRefName: "picastle/repo-abc-stale-token" }],
      }),
    /Invalid open PR number for picastle\/repo-abc-stale-token/,
  );

  assert.throws(
    () =>
      parsePlannerContext({
        candidates,
        openPrs: [{ headRefName: "picastle/repo-abc-stale-token", url: 42 }],
      }),
    /Invalid open PR url for picastle\/repo-abc-stale-token/,
  );
}

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

{
  assert.throws(
    () => parsePlannerPlan("no plan here", { candidates, openPrs: [] }),
    /Planner did not produce a <plan> block/,
  );
  assert.throws(
    () => parsePlannerPlan("<plan>{not json}</plan>", { candidates, openPrs: [] }),
    SyntaxError,
  );
  assert.throws(
    () => parsePlannerPlan('<plan>{"skipped": []}</plan>', { candidates, openPrs: [] }),
    /issues array/,
  );
}

{
  assert.throws(
    () =>
      parsePlannerPlan(
        `<plan>{"issues":[
          {"id":"repo-abc","title":"fix(auth): stale token","branch":"picastle/repo-abc-token"},
          {"id":"repo-abc","title":"fix(auth): stale token again","branch":"picastle/repo-abc-token-again"}
        ]}</plan>`,
        { candidates, openPrs: [] },
      ),
    /duplicate planned issue id: repo-abc/,
  );

  assert.throws(
    () =>
      parsePlannerPlan(
        '<plan>{"issues":[{"id":"repo-zzz","title":"unknown","branch":"picastle/repo-zzz-unknown"}]}</plan>',
        { candidates, openPrs: [] },
      ),
    /not present in candidates: repo-zzz/,
  );

  assert.throws(
    () =>
      parsePlannerPlan(
        '<plan>{"issues":[],"skipped":[{"id":"repo-zzz","title":"unknown","category":"other","reason":"hallucinated"}]}</plan>',
        { candidates, openPrs: [] },
      ),
    /not present in candidates: repo-zzz/,
  );

  assert.throws(
    () =>
      parsePlannerPlan(
        '<plan>{"issues":[{"id":"repo-abc","title":"fix(auth): stale token"}]}</plan>',
        { candidates, openPrs: [] },
      ),
    /Invalid planned issue/,
  );

  assert.throws(
    () =>
      parsePlannerPlan(
        '<plan>{"issues":[{"id":"repo-abc","title":"fix(auth): stale token","branch":"picastle/repo-def-token"}]}</plan>',
        { candidates, openPrs: [] },
      ),
    /must normalize to picastle\/repo-abc-/,
  );

  assert.throws(
    () =>
      parsePlannerPlan(
        '<plan>{"issues":[{"id":"repo-abc","title":"fix(auth): stale token","branch":"feature/repo-abc-token"}]}</plan>',
        { candidates, openPrs: [] },
      ),
    /must use picastle\/repo-abc-/,
  );
}

{
  assert.throws(
    () =>
      parsePlannerPlan(
        `<plan>{
          "issues": [],
          "skipped": [null]
        }</plan>`,
        { candidates: candidates.slice(0, 1), openPrs: [] },
      ),
    /Invalid skipped issue: null/,
  );

  assert.throws(
    () =>
      parsePlannerPlan(
        `<plan>{
          "issues": [],
          "skipped": [{"title":"missing id","category":"dependency","reason":"no candidate id"}]
        }</plan>`,
        { candidates: candidates.slice(0, 1), openPrs: [] },
      ),
    /Invalid skipped issue/,
  );

  assert.throws(
    () =>
      parsePlannerPlan(
        '<plan>{"issues":[],"skipped":{"id":"repo-abc","reason":"not an array"}}</plan>',
        { candidates, openPrs: [] },
      ),
    /skipped field must be an array/,
  );

  assert.throws(
    () =>
      parsePlannerPlan(
        '<plan>{"issues":[],"skipped":[{"id":"repo-abc","reason":"bad blockers","blockers":"repo-def"}]}</plan>',
        { candidates, openPrs: [] },
      ),
    /blockers for repo-abc: must be an array/,
  );

  assert.throws(
    () =>
      parsePlannerPlan(
        `<plan>{
          "issues": [],
          "skipped": [
            {"id":"repo-abc","reason":"first explanation"},
            {"id":"repo-abc","reason":"second explanation"}
          ]
        }</plan>`,
        { candidates, openPrs: [] },
      ),
    /duplicate skipped issue id: repo-abc/,
  );
}

{
  assert.throws(
    () =>
      parsePlannerPlan(
        `<plan>{
          "issues": [{"id":"repo-abc","title":"fix(auth): stale token","branch":"picastle/repo-abc-token"}],
          "skipped": [{"id":"repo-abc","title":"fix(auth): stale token","category":"dependency","reason":"also skipped"}]
        }</plan>`,
        { candidates, openPrs: [] },
      ),
    /in both issues and skipped: repo-abc/,
  );
}

{
  assert.throws(
    () => parsePlannerPlan('<plan>{"issues": []}</plan>', { candidates: [null], openPrs: [] }),
    /Invalid candidate issue at index 0/,
  );

  assert.throws(
    () => parsePlannerPlan('<plan>{"issues": []}</plan>', { candidates: [{ title: "missing id" }], openPrs: [] }),
    /Invalid candidate issue id at index 0/,
  );

  assert.throws(
    () => parsePlannerPlan('<plan>{"issues": []}</plan>', { candidates, openPrs: [null] }),
    /Invalid open PR record at index 0/,
  );

  assert.throws(
    () => parsePlannerPlan('<plan>{"issues": []}</plan>', { candidates, openPrs: [{ number: 42, url: "https://github.com/acme/repo/pull/42" }] }),
    /Invalid open PR headRefName at index 0/,
  );
}

{
  const decision = parsePlannerPlan(
    `<plan>{
      "issues": [
        {"id":"repo-abc","title":"fix(auth): stale token","branch":"picastle/repo-abc-token"},
        {"id":"repo-def","title":"feat(ui): new panel","branch":"picastle/repo-def-panel"}
      ],
      "skipped": [{"id":"repo-ghi","title":"chore(api): cleanup","category":"policy_status","reason":"deferred by policy","blockers":[]}]
    }</plan>`,
    { candidates: candidatesWithThird, openPrs: [], maxIssues: 1 },
  );

  assert.deepEqual(decision.issues, [
    { id: "repo-abc", title: "fix(auth): stale token", branch: "picastle/repo-abc-token" },
  ]);
  assert.equal(decision.skipped.length, 2);
  assert.equal(decision.skipped.find((issue) => issue.id === "repo-def")?.category, "policy_status");
  assert.match(decision.skipped.find((issue) => issue.id === "repo-def")?.reason ?? "", /PICASTLE_MAX_ISSUES=1/);
  assert.equal(decision.skipped.find((issue) => issue.id === "repo-ghi")?.reason, "deferred by policy");
  assert.equal(decision.hasSyntheticExplanations, true);
}

console.log("planner-output tests passed");
