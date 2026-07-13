import { constants } from "node:fs";
import { lstat, open, readFile, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const LINEAR_API_URL = "https://api.linear.app/graphql";

const WORKSPACE_GUARD_QUERY = `
  query LinearWorkspaceGuard {
    viewer {
      id
      organization {
        id
        name
        urlKey
      }
    }
  }
`;

function expandHome(filePath, homeDirectory = os.homedir()) {
  if (filePath === "~") return homeDirectory;
  if (filePath.startsWith("~/")) return path.join(homeDirectory, filePath.slice(2));
  return filePath;
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

export function validateProfile(profile) {
  assertObject(profile, "Linear profile");
  assertObject(profile.organization, "Linear profile organization");

  for (const [label, value] of [
    ["name", profile.name],
    ["organization.id", profile.organization.id],
    ["organization.urlKey", profile.organization.urlKey],
    ["envFile", profile.envFile],
    ["keyName", profile.keyName],
  ]) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`Linear profile ${label} must be a non-empty string.`);
    }
  }

  if (!/^[A-Z_][A-Z0-9_]*$/.test(profile.keyName)) {
    throw new Error("Linear profile keyName must be an uppercase environment-style name.");
  }

  return profile;
}

export function parseEnvText(text, keyName) {
  if (typeof text !== "string") throw new Error("Credential file must contain text.");

  const values = [];
  for (const [index, originalLine] of text.split(/\r?\n/).entries()) {
    const line = originalLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const match = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!match || match[1] !== keyName) {
      throw new Error(`Credential file has unexpected content on line ${index + 1}.`);
    }

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else if (!/^[A-Za-z0-9._-]+$/.test(value)) {
      throw new Error(`Credential file has an invalid literal value on line ${index + 1}.`);
    }

    if (value === "") throw new Error("Credential value must not be empty.");
    values.push(value);
  }

  if (values.length !== 1) {
    throw new Error(`Credential file must contain exactly one ${keyName} assignment.`);
  }
  return values[0];
}

function permissionMode(stats) {
  return stats.mode & 0o777;
}

function modeString(mode) {
  return mode.toString(8).padStart(3, "0");
}

export async function loadCredential(
  rawProfile,
  { homeDirectory = os.homedir(), uid = process.getuid?.() } = {},
) {
  const profile = validateProfile(rawProfile);
  const envFile = path.resolve(expandHome(profile.envFile, homeDirectory));
  const directory = path.dirname(envFile);
  const [directoryStats, resolvedDirectory] = await Promise.all([lstat(directory), realpath(directory)]);

  if (
    directoryStats.isSymbolicLink() ||
    !directoryStats.isDirectory() ||
    resolvedDirectory !== directory
  ) {
    throw new Error(`Credential directory must be a real directory, not a symlink: ${directory}`);
  }
  if (uid !== undefined && directoryStats.uid !== uid) {
    throw new Error("Credential directory must be owned by the current user.");
  }
  if (permissionMode(directoryStats) !== 0o700) {
    throw new Error(
      `Credential directory must have mode 0700; found ${modeString(permissionMode(directoryStats))}.`,
    );
  }
  let handle;
  try {
    handle = await open(envFile, constants.O_RDONLY | constants.O_NOFOLLOW);
    const fileStats = await handle.stat();
    if (!fileStats.isFile()) throw new Error(`Credential file must be a regular file: ${envFile}`);
    if (uid !== undefined && fileStats.uid !== uid) {
      throw new Error("Credential file must be owned by the current user.");
    }
    if (permissionMode(fileStats) !== 0o600) {
      throw new Error(
        `Credential file must have mode 0600; found ${modeString(permissionMode(fileStats))}.`,
      );
    }
    return parseEnvText(await handle.readFile("utf8"), profile.keyName);
  } catch (error) {
    if (error?.code === "ELOOP") {
      throw new Error(`Credential file must be a regular file, not a symlink: ${envFile}`);
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

function redact(message, credential) {
  return String(message).replaceAll(credential, "[REDACTED]").slice(0, 1000);
}

async function graphqlRequest({ query, variables, credential, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(LINEAR_API_URL, {
      method: "POST",
      headers: {
        Authorization: credential,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(`Linear API request failed: ${redact(error.message, credential)}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`Linear API returned non-JSON data (HTTP ${response.status}).`);
  }

  if (!response.ok || payload.errors) {
    const messages = Array.isArray(payload.errors)
      ? payload.errors.map((error) => String(error?.message ?? "Unknown GraphQL error"))
      : [];
    const summary = redact(messages.join("; "), credential);
    throw new Error(
      `Linear API request failed (HTTP ${response.status})${summary ? `: ${summary}` : "."}`,
    );
  }

  return payload.data;
}

export async function executeVerifiedOperation({
  profile: rawProfile,
  query,
  variables = {},
  fetchImpl = globalThis.fetch,
  credentialOptions,
}) {
  const profile = validateProfile(rawProfile);
  if (typeof query !== "string" || query.trim() === "") {
    throw new Error("GraphQL query must be a non-empty string.");
  }
  assertObject(variables, "GraphQL variables");
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");

  const credential = await loadCredential(profile, credentialOptions);
  const guardData = await graphqlRequest({
    query: WORKSPACE_GUARD_QUERY,
    variables: {},
    credential,
    fetchImpl,
  });
  const actual = guardData?.viewer?.organization;
  const expected = profile.organization;

  if (!actual || actual.id !== expected.id || actual.urlKey !== expected.urlKey) {
    throw new Error(
      `Linear workspace identity mismatch: expected ${expected.urlKey} (${expected.id}); request blocked.`,
    );
  }

  const data = await graphqlRequest({ query, variables, credential, fetchImpl });
  return {
    workspace: { id: actual.id, name: actual.name, urlKey: actual.urlKey },
    data,
  };
}

function requireFlagValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

export function parseCliArgs(argv, { lockedProfilePath = null } = {}) {
  let profilePath = lockedProfilePath;
  let variables = {};
  let variablesFile = null;
  let pretty = false;
  let envelope = false;
  let queryPath = null;
  let variableSource = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--profile") {
      if (lockedProfilePath) throw new Error("This launcher is workspace-locked; --profile is forbidden.");
      profilePath = requireFlagValue(argv, index, argument);
      index += 1;
    } else if (argument === "--variables") {
      if (variableSource) throw new Error("GraphQL variables may be supplied exactly once.");
      variableSource = "inline";
      const raw = requireFlagValue(argv, index, argument);
      try {
        variables = JSON.parse(raw);
      } catch (error) {
        throw new Error(`--variables must be valid JSON: ${error.message}`);
      }
      assertObject(variables, "GraphQL variables");
      index += 1;
    } else if (argument === "--variables-file") {
      if (variableSource) throw new Error("GraphQL variables may be supplied exactly once.");
      variableSource = "file";
      variablesFile = requireFlagValue(argv, index, argument);
      index += 1;
    } else if (argument === "--pretty") {
      pretty = true;
    } else if (argument === "--envelope") {
      envelope = true;
    } else if (argument === "--help" || argument === "-h") {
      return { help: true, locked: Boolean(lockedProfilePath) };
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (queryPath) {
      throw new Error("Only one GraphQL query file may be supplied.");
    } else {
      queryPath = argument;
    }
  }

  if (!profilePath) throw new Error("--profile is required for the generic transport.");
  if (!queryPath) throw new Error("A GraphQL query file is required.");
  if (queryPath === "-" && variablesFile === "-") {
    throw new Error("The query and variables cannot both read from stdin.");
  }

  return { envelope, pretty, profilePath, queryPath, variables, variablesFile };
}

async function readInput(inputPath, stdin) {
  if (inputPath === "-") {
    const chunks = [];
    for await (const chunk of stdin) chunks.push(chunk);
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  }
  return readFile(inputPath, "utf8");
}

function helpText(locked) {
  const profile = locked ? "" : " --profile <profile.json>";
  return `Usage: linear-gql${profile} <query.graphql> [options]\n\n` +
    "Options:\n" +
    "  --variables <json>       Inline GraphQL variables\n" +
    "  --variables-file <path>  Read GraphQL variables from JSON\n" +
    "  --envelope               Include verified workspace metadata\n" +
    "  --pretty                 Pretty-print JSON output\n" +
    "  -h, --help               Show this help\n";
}

export async function runCli({
  argv = process.argv.slice(2),
  lockedProfilePath = null,
  lockedProfile = null,
  forceEnvelope = false,
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
  fetchImpl = globalThis.fetch,
  credentialOptions,
} = {}) {
  try {
    if (lockedProfile && lockedProfilePath) {
      throw new Error("Use either lockedProfile or lockedProfilePath, not both.");
    }
    const options = parseCliArgs(argv, {
      lockedProfilePath: lockedProfile ? "<workspace-locked>" : lockedProfilePath,
    });
    if (options.help) {
      stdout.write(helpText(options.locked));
      return 0;
    }

    const profile = lockedProfile ?? JSON.parse(await readFile(options.profilePath, "utf8"));
    const query = await readInput(options.queryPath, stdin);
    let variables = options.variables;
    if (options.variablesFile) {
      try {
        variables = JSON.parse(await readInput(options.variablesFile, stdin));
      } catch (error) {
        throw new Error(`Variables file must contain valid JSON: ${error.message}`);
      }
    }

    const result = await executeVerifiedOperation({
      profile,
      query,
      variables,
      fetchImpl,
      credentialOptions,
    });
    const output = options.envelope || forceEnvelope ? result : result.data;
    stdout.write(`${JSON.stringify(output, null, options.pretty ? 2 : 0)}\n`);
    return 0;
  } catch (error) {
    stderr.write(`Error: ${error.message}\n`);
    return 1;
  }
}
