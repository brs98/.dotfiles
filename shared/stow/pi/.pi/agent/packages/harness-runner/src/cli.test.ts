import assert from "node:assert/strict";
import test from "node:test";

import { assertNoCollisions, resolveHarness } from "./cli.ts";

test("resolves the minimal harness to only its declared package resources", async () => {
  const resolved = await resolveHarness("minimal");

  assert.deepEqual(
    resolved.resources.map(({ owner }) => owner),
    ["@dotfiles/pi-extension-ricekit"],
  );
  assert.equal(resolved.arguments[0], "--no-extensions");
  assert.equal(resolved.arguments[1], "-e");
  assert.match(resolved.arguments[2] ?? "", /packages\/ricekit\/src\/index\.ts$/);
});

test("preserves ambient discovery for the original harness", async () => {
  const resolved = await resolveHarness("original");

  assert.deepEqual(resolved.resources, []);
  assert.deepEqual(resolved.arguments, []);
});

test("rejects capability collisions across packages", () => {
  const empty = { tools: [], commands: [], flags: [], shortcuts: [], uiSlots: [] } as const;

  assert.throws(
    () =>
      assertNoCollisions([
        { owner: "first", provides: { ...empty, commands: ["review"] } },
        { owner: "second", provides: { ...empty, commands: ["review"] } },
      ]),
    /commands collision.*first and second/,
  );
});

test("reserves upstream Pi command names from harness use", async () => {
  await assert.rejects(resolveHarness("update"), /reserved harness name/);
});
