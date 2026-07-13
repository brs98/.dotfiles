import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { executeVerifiedOperation } from "../../linear-graphql/scripts/linear-gql-core.mjs";
import { main } from "../scripts/linear-fluid-commerce-gql.mjs";
import { lockedProfile } from "../scripts/linear-fluid-commerce-profile.mjs";

const FLUID_COMMERCE_ORGANIZATION = {
  id: "54014601-3568-41d9-bc77-384a8559283d",
  name: "Fluid Commerce",
  urlKey: "fluid-commerce",
};
const launcherPath = fileURLToPath(
  new URL("../scripts/linear-fluid-commerce-gql.mjs", import.meta.url),
);

async function secureCredentialFile(credential = "lin_api_dummy") {
  const root = await mkdtemp(
    path.join(await realpath(os.tmpdir()), "linear-fluid-commerce-test-"),
  );
  const directory = path.join(root, ".config", "linear", "workspaces");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const envFile = path.join(directory, "fluid-commerce.env");
  await writeFile(envFile, `LINEAR_API_KEY=${credential}\n`, { mode: 0o600 });
  await chmod(envFile, 0o600);
  return { envFile, root };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("profile is permanently pinned to Fluid Commerce", () => {
  assert.deepEqual(lockedProfile, {
    name: "fluid-commerce",
    organization: {
      id: FLUID_COMMERCE_ORGANIZATION.id,
      urlKey: FLUID_COMMERCE_ORGANIZATION.urlKey,
    },
    envFile: "~/.config/linear/workspaces/fluid-commerce.env",
    keyName: "LINEAR_API_KEY",
  });
  assert.equal(Object.isFrozen(lockedProfile), true);
  assert.equal(Object.isFrozen(lockedProfile.organization), true);
});

test("launcher forbids selecting another profile", () => {
  const result = spawnSync(
    process.execPath,
    [launcherPath, "--profile", "/tmp/other-workspace.json", "/tmp/query.graphql"],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /workspace-locked; --profile is forbidden/i);
});

test("launcher help exposes no profile selector", () => {
  const result = spawnSync(process.execPath, [launcherPath, "--help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.doesNotMatch(result.stdout, /--profile/);
  assert.match(result.stdout, /^Usage: linear-gql <query\.graphql>/);
});

test("launcher executes when invoked through the installed skill symlink", async () => {
  const root = await mkdtemp(
    path.join(await realpath(os.tmpdir()), "linear-fluid-commerce-link-test-"),
  );
  const linkedLauncher = path.join(root, "linear-fluid-commerce-gql.mjs");
  await symlink(launcherPath, linkedLauncher);

  const result = spawnSync(process.execPath, [linkedLauncher, "--help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^Usage: linear-gql <query\.graphql>/);
});

test("actual launcher ignores ambient credentials and forces the Fluid Commerce envelope", async () => {
  const { root } = await secureCredentialFile("lin_api_fluid_file");
  const queryPath = path.join(root, "teams.graphql");
  await writeFile(queryPath, "query { teams { nodes { id } } }\n");
  const calls = [];
  const responses = [
    {
      data: {
        viewer: {
          id: "viewer-fluid-commerce",
          organization: FLUID_COMMERCE_ORGANIZATION,
        },
      },
    },
    { data: { teams: { nodes: [{ id: "current-team" }] } } },
  ];
  let output = "";
  let errorOutput = "";
  const previousAmbientKey = process.env.LINEAR_API_KEY;
  process.env.LINEAR_API_KEY = "lin_api_devxperience_ambient";

  try {
    const exitCode = await main({
      argv: [queryPath],
      credentialOptions: { homeDirectory: root },
      fetchImpl: async (_url, init) => {
        calls.push(init);
        return jsonResponse(responses.shift());
      },
      stdout: { write: (chunk) => { output += chunk; } },
      stderr: { write: (chunk) => { errorOutput += chunk; } },
    });

    assert.equal(exitCode, 0);
    assert.equal(errorOutput, "");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].headers.Authorization, "lin_api_fluid_file");
    assert.equal(calls[1].headers.Authorization, "lin_api_fluid_file");
    assert.deepEqual(JSON.parse(output), {
      workspace: FLUID_COMMERCE_ORGANIZATION,
      data: { teams: { nodes: [{ id: "current-team" }] } },
    });
  } finally {
    if (previousAmbientKey === undefined) delete process.env.LINEAR_API_KEY;
    else process.env.LINEAR_API_KEY = previousAmbientKey;
  }
});

test("actual launcher blocks a wrong-workspace file credential before the operation", async () => {
  const { root } = await secureCredentialFile("lin_api_devxperience_file");
  const queryPath = path.join(root, "teams.graphql");
  await writeFile(queryPath, "query { teams { nodes { id } } }\n");
  const calls = [];
  let output = "";
  let errorOutput = "";

  const exitCode = await main({
    argv: [queryPath],
    credentialOptions: { homeDirectory: root },
    fetchImpl: async (_url, init) => {
      calls.push(init);
      return jsonResponse({
        data: {
          viewer: {
            id: "viewer-devxperience",
            organization: {
              id: "f877e44d-aedc-41d7-b405-8fe7fbd1d925",
              name: "devxperience",
              urlKey: "devxperience",
            },
          },
        },
      });
    },
    stdout: { write: (chunk) => { output += chunk; } },
    stderr: { write: (chunk) => { errorOutput += chunk; } },
  });

  assert.equal(exitCode, 1);
  assert.equal(output, "");
  assert.match(errorOutput, /workspace identity mismatch/i);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.Authorization, "lin_api_devxperience_file");
});

test("a different workspace is rejected before the requested operation", async () => {
  const { envFile } = await secureCredentialFile();
  const calls = [];

  await assert.rejects(
    executeVerifiedOperation({
      profile: { ...lockedProfile, envFile },
      query: "query { teams { nodes { id } } }",
      fetchImpl: async (_url, init) => {
        calls.push(init);
        return jsonResponse({
          data: {
            viewer: {
              id: "viewer-devxperience",
              organization: {
                id: "f877e44d-aedc-41d7-b405-8fe7fbd1d925",
                name: "devxperience",
                urlKey: "devxperience",
              },
            },
          },
        });
      },
    }),
    /workspace identity mismatch/i,
  );

  assert.equal(calls.length, 1);
});

test("the pinned workspace identity allows the requested operation", async () => {
  const { envFile } = await secureCredentialFile();
  const responses = [
    {
      data: {
        viewer: {
          id: "viewer-fluid-commerce",
          organization: FLUID_COMMERCE_ORGANIZATION,
        },
      },
    },
    { data: { teams: { nodes: [{ id: "current-team" }] } } },
  ];

  const result = await executeVerifiedOperation({
    profile: { ...lockedProfile, envFile },
    query: "query { teams { nodes { id } } }",
    fetchImpl: async () => jsonResponse(responses.shift()),
  });

  assert.deepEqual(result, {
    workspace: FLUID_COMMERCE_ORGANIZATION,
    data: { teams: { nodes: [{ id: "current-team" }] } },
  });
});
