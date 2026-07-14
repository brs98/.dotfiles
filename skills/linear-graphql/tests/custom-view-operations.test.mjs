import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const operationsUrl = new URL("../operations/", import.meta.url);

const expectedOperations = new Map([
  ["custom-views.graphql", "CustomViews"],
  ["custom-view.graphql", "CustomView"],
  ["custom-view-create.graphql", "CustomViewCreate"],
  ["custom-view-update.graphql", "CustomViewUpdate"],
  ["custom-view-delete.graphql", "CustomViewDelete"],
  ["custom-view-issues.graphql", "CustomViewIssues"],
  ["custom-view-has-subscribers.graphql", "CustomViewHasSubscribers"],
]);

test("catalog exposes reusable custom-view operations", async () => {
  for (const [filename, operationName] of expectedOperations) {
    const document = await readFile(new URL(filename, operationsUrl), "utf8");

    assert.match(document, new RegExp(`(?:query|mutation) ${operationName}\\b`));
    assert.doesNotMatch(document, /\bfilters\b/, `${filename} uses deprecated CustomView.filters`);
  }
});

test("workspace references route custom-view work through the catalog", async () => {
  const referenceUrls = [
    new URL("../../linear-devxperience/REFERENCE.md", import.meta.url),
    new URL("../../linear-fluid-commerce/REFERENCE.md", import.meta.url),
  ];

  for (const referenceUrl of referenceUrls) {
    const reference = await readFile(referenceUrl, "utf8");
    for (const filename of expectedOperations.keys()) {
      assert.match(reference, new RegExp(`operations/${filename}|\\$OPS/${filename}`));
    }
  }
});

test("issue-view results can preserve sub-team inclusion", async () => {
  const document = await readFile(new URL("custom-view-issues.graphql", operationsUrl), "utf8");

  assert.match(document, /\$includeSubTeams:\s*Boolean\s*=\s*false/);
  assert.match(document, /includeSubTeams:\s*\$includeSubTeams/);
});
