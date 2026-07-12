import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  executeVerifiedOperation,
  loadCredential,
  parseCliArgs,
  parseEnvText,
  runCli,
} from "../scripts/linear-gql-core.mjs";

const EXPECTED_ORGANIZATION = {
  id: "org-devxperience",
  name: "devxperience",
  urlKey: "devxperience",
};

async function secureEnvFile(contents = "LINEAR_API_KEY=lin_api_dummy\n") {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), "linear-gql-test-"));
  const directory = path.join(root, "workspaces");
  await mkdir(directory, { mode: 0o700 });
  await chmod(directory, 0o700);
  const envFile = path.join(directory, "devxperience.env");
  await writeFile(envFile, contents, { mode: 0o600 });
  await chmod(envFile, 0o600);
  return { directory, envFile, root };
}

function profile(envFile) {
  return {
    name: "devxperience",
    organization: EXPECTED_ORGANIZATION,
    envFile,
    keyName: "LINEAR_API_KEY",
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("parseEnvText accepts one literal credential assignment", () => {
  assert.equal(
    parseEnvText("# Linear personal API key\nLINEAR_API_KEY='lin_api_dummy'\n", "LINEAR_API_KEY"),
    "lin_api_dummy",
  );
});

test("parseEnvText rejects duplicates, extra assignments, and shell syntax", () => {
  assert.throws(
    () => parseEnvText("LINEAR_API_KEY=one\nLINEAR_API_KEY=two\n", "LINEAR_API_KEY"),
    /exactly one/i,
  );
  assert.throws(
    () => parseEnvText("LINEAR_API_KEY=one\nOTHER_SECRET=two\n", "LINEAR_API_KEY"),
    /unexpected content/i,
  );
  assert.throws(
    () => parseEnvText("export LINEAR_API_KEY=$(op read secret)\n", "LINEAR_API_KEY"),
    /unexpected content/i,
  );
});

test("loadCredential requires a regular 0600 file in a 0700 directory", async () => {
  const { directory, envFile } = await secureEnvFile();
  assert.equal(await loadCredential(profile(envFile)), "lin_api_dummy");

  await chmod(envFile, 0o644);
  await assert.rejects(loadCredential(profile(envFile)), /0600/);
  await chmod(envFile, 0o600);

  await chmod(directory, 0o755);
  await assert.rejects(loadCredential(profile(envFile)), /0700/);
});

test("loadCredential rejects symlinks", async () => {
  const { directory, envFile } = await secureEnvFile();
  const link = path.join(directory, "linked.env");
  await symlink(envFile, link);
  await assert.rejects(loadCredential(profile(link)), /symlink/i);
});

test("loadCredential rejects a symlinked credential directory", async () => {
  const { envFile, root } = await secureEnvFile();
  const linkedDirectory = path.join(root, "linked-workspaces");
  await symlink(path.dirname(envFile), linkedDirectory);
  await assert.rejects(
    loadCredential(profile(path.join(linkedDirectory, "devxperience.env"))),
    /symlink/i,
  );
});

test("executeVerifiedOperation blocks a mismatched workspace before the user operation", async () => {
  const { envFile } = await secureEnvFile();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({
      data: {
        viewer: {
          id: "viewer-other",
          organization: { id: "org-other", name: "Other", urlKey: "other" },
        },
      },
    });
  };

  await assert.rejects(
    executeVerifiedOperation({
      profile: profile(envFile),
      query: "mutation { issueCreate(input: {}) { success } }",
      variables: {},
      fetchImpl,
    }),
    /workspace identity mismatch/i,
  );
  assert.equal(calls.length, 1);
});

test("executeVerifiedOperation runs only after preflight and never returns the credential", async () => {
  const { envFile } = await secureEnvFile();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) {
      return jsonResponse({
        data: {
          viewer: { id: "viewer-devx", organization: EXPECTED_ORGANIZATION },
        },
      });
    }
    return jsonResponse({ data: { issue: { identifier: "DEV-1", title: "Fix checkout" } } });
  };

  const result = await executeVerifiedOperation({
    profile: profile(envFile),
    query: "query Issue($id: String!) { issue(id: $id) { identifier title } }",
    variables: { id: "DEV-1" },
    fetchImpl,
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://api.linear.app/graphql");
  assert.equal(calls[0].init.headers.Authorization, "lin_api_dummy");
  assert.match(JSON.parse(calls[0].init.body).query, /LinearWorkspaceGuard/);
  assert.deepEqual(result, {
    workspace: EXPECTED_ORGANIZATION,
    data: { issue: { identifier: "DEV-1", title: "Fix checkout" } },
  });
  assert.doesNotMatch(JSON.stringify(result), /lin_api_dummy/);
});

test("executeVerifiedOperation redacts credentials from transport failures", async () => {
  const { envFile } = await secureEnvFile();
  await assert.rejects(
    executeVerifiedOperation({
      profile: profile(envFile),
      query: "query { viewer { id } }",
      fetchImpl: async (_url, init) => {
        throw new Error(`failed with ${init.headers.Authorization}`);
      },
    }),
    (error) => {
      assert.match(error.message, /\[REDACTED\]/);
      assert.doesNotMatch(error.message, /lin_api_dummy/);
      return true;
    },
  );
});

test("locked CLI arguments reject profile overrides and ambient selection", () => {
  assert.throws(
    () => parseCliArgs(["--profile", "other.json", "query.graphql"], { lockedProfilePath: "devx.json" }),
    /locked/i,
  );
  assert.deepEqual(
    parseCliArgs(["query.graphql", "--variables", '{"id":"DEV-1"}'], {
      lockedProfilePath: "devx.json",
    }),
    {
      envelope: false,
      pretty: false,
      profilePath: "devx.json",
      queryPath: "query.graphql",
      variables: { id: "DEV-1" },
      variablesFile: null,
    },
  );
});

test("CLI rejects duplicate or mixed variable sources", () => {
  assert.throws(
    () => parseCliArgs(["query.graphql", "--variables", "{}", "--variables-file", "vars.json"], {
      lockedProfilePath: "devx.json",
    }),
    /exactly once/i,
  );
  assert.throws(
    () => parseCliArgs(["query.graphql", "--variables", "{}", "--variables", "{}"], {
      lockedProfilePath: "devx.json",
    }),
    /exactly once/i,
  );
});

test("locked CLI always emits verified workspace metadata", async () => {
  const { envFile, root } = await secureEnvFile();
  const queryPath = path.join(root, "query.graphql");
  await writeFile(queryPath, "query { viewer { id } }\n");
  const responses = [
    { data: { viewer: { id: "viewer-devx", organization: EXPECTED_ORGANIZATION } } },
    { data: { viewer: { id: "viewer-devx" } } },
  ];
  let output = "";
  let errorOutput = "";
  const exitCode = await runCli({
    argv: [queryPath],
    lockedProfile: profile(envFile),
    forceEnvelope: true,
    fetchImpl: async () => jsonResponse(responses.shift()),
    stdout: { write: (chunk) => { output += chunk; } },
    stderr: { write: (chunk) => { errorOutput += chunk; } },
  });

  assert.equal(exitCode, 0);
  assert.equal(errorOutput, "");
  assert.deepEqual(JSON.parse(output), {
    workspace: EXPECTED_ORGANIZATION,
    data: { viewer: { id: "viewer-devx" } },
  });
});
