import assert from "node:assert/strict";
import test from "node:test";

import {
  parseStackMetadataFromBody,
  planStackRetargets,
  stackBaseBranch,
  upsertStackPrBodySection,
  stackContext,
  stackIssues,
  stackPebblesComment,
  stackPrBodySection,
} from "./stack.mjs";

test("builds ordered stack metadata and PR copy", () => {
  const [first, second, third] = stackIssues(
    [
      { id: "repo-aaa", title: "A", branch: "picastle/repo-aaa-a" },
      { id: "repo-bbb", title: "B", branch: "picastle/repo-bbb-b" },
      { id: "repo-ccc", title: "C", branch: "picastle/repo-ccc-c" },
    ],
    "main",
  );

  assert.equal(stackBaseBranch(first!.stack), "main");
  assert.equal(stackBaseBranch(second!.stack), "picastle/repo-aaa-a");
  assert.deepEqual(third!.stack, {
    stackId: "repo-aaa-repo-bbb-repo-ccc",
    index: 3,
    total: 3,
    issueId: "repo-ccc",
    headBranch: "picastle/repo-ccc-c",
    baseBranch: "main",
    previousBranch: "picastle/repo-bbb-b",
  });

  assert.match(stackContext(second!.stack), /position 2\/3/);
  const section = stackPrBodySection(second!.stack);
  assert.match(section, /<!-- picastle-stack/);
  assert.match(section, /This PR is \*\*2 of 3\*\*/);
  assert.deepEqual(parseStackMetadataFromBody(section), second!.stack);
  assert.match(stackPebblesComment(second!.stack, "https://github.com/acme/repo/pull/2")!, /stacked PR 2\/3/);
});

test("retargets open stack PRs to the nearest previous open stack entry", () => {
  const [first, second, third] = stackIssues(
    [
      { id: "repo-aaa", title: "A", branch: "picastle/repo-aaa-a" },
      { id: "repo-bbb", title: "B", branch: "picastle/repo-bbb-b" },
      { id: "repo-ccc", title: "C", branch: "picastle/repo-ccc-c" },
    ],
    "main",
  );

  assert.deepEqual(
    planStackRetargets(
      [
        {
          number: 2,
          headRefName: second!.branch,
          baseRefName: first!.branch,
          url: "https://github.com/acme/repo/pull/2",
          body: stackPrBodySection(second!.stack),
        },
        {
          number: 3,
          headRefName: third!.branch,
          baseRefName: first!.branch,
          url: "https://github.com/acme/repo/pull/3",
          body: stackPrBodySection(third!.stack),
        },
      ],
      "main",
    ).map((action) => [action.prRef, action.currentBase, action.expectedBase]),
    [
      ["https://github.com/acme/repo/pull/2", first!.branch, "main"],
      ["https://github.com/acme/repo/pull/3", first!.branch, second!.branch],
    ],
  );
});

test("refreshes next stack metadata to the next still-open PR", () => {
  const [first, second, third] = stackIssues(
    [
      { id: "repo-aaa", title: "A", branch: "picastle/repo-aaa-a" },
      { id: "repo-bbb", title: "B", branch: "picastle/repo-bbb-b" },
      { id: "repo-ccc", title: "C", branch: "picastle/repo-ccc-c" },
    ],
    "main",
  );

  const actions = planStackRetargets(
    [
      {
        number: 1,
        headRefName: first!.branch,
        baseRefName: "main",
        url: "https://github.com/acme/repo/pull/1",
        body: stackPrBodySection(first!.stack),
      },
      {
        number: 3,
        headRefName: third!.branch,
        baseRefName: second!.branch,
        url: "https://github.com/acme/repo/pull/3",
        body: stackPrBodySection(third!.stack),
      },
    ],
    "main",
  );

  assert.deepEqual(
    actions.map((action) => [action.headRefName, action.expectedBase, action.stack.previousBranch, action.stack.nextBranch]),
    [
      [first!.branch, "main", undefined, third!.branch],
      [third!.branch, first!.branch, first!.branch, undefined],
    ],
  );
  assert.equal(actions[0]!.updateBase, false);
  assert.equal(actions[0]!.updateBody, true);
});

test("ignores malformed or non-stack PR bodies when planning retargets", () => {
  assert.equal(parseStackMetadataFromBody("<!-- picastle-stack\nnot json\n-->"), undefined);
  assert.deepEqual(
    planStackRetargets(
      [
        { number: 1, headRefName: "picastle/repo-aaa-a", baseRefName: "main", body: "no marker" },
        { number: 2, headRefName: "picastle/repo-bbb-b", baseRefName: "main", body: "<!-- picastle-stack\n{}\n-->" },
      ],
      "main",
    ),
    [],
  );
});

test("refreshes stack body metadata when an upstream stack PR is gone", () => {
  const [first, second, third] = stackIssues(
    [
      { id: "repo-aaa", title: "A", branch: "picastle/repo-aaa-a" },
      { id: "repo-bbb", title: "B", branch: "picastle/repo-bbb-b" },
      { id: "repo-ccc", title: "C", branch: "picastle/repo-ccc-c" },
    ],
    "main",
  );

  const actions = planStackRetargets(
    [
      {
        number: 2,
        headRefName: second!.branch,
        baseRefName: first!.branch,
        url: "https://github.com/acme/repo/pull/2",
        body: stackPrBodySection(second!.stack),
      },
      {
        number: 3,
        headRefName: third!.branch,
        baseRefName: third!.stack.previousBranch,
        url: "https://github.com/acme/repo/pull/3",
        body: stackPrBodySection(third!.stack),
      },
    ],
    "main",
  );

  assert.equal(actions.length, 1);
  assert.equal(actions[0]!.expectedBase, "main");
  assert.equal(actions[0]!.stack.previousBranch, undefined);
  assert.equal(actions[0]!.stack.nextBranch, third!.branch);
  assert.equal(actions[0]!.updateBody, true);

  const originalBody = `${stackPrBodySection(second!.stack)}## Summary\n\nKeep this text.\n`;
  const refreshedBody = upsertStackPrBodySection(originalBody, actions[0]!.stack);
  assert.match(refreshedBody, /Base: `main`/);
  assert.doesNotMatch(refreshedBody, /Previous: `picastle\/repo-aaa-a`/);
  assert.match(refreshedBody, /## Summary\n\nKeep this text/);
});
