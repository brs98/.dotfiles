#!/usr/bin/env node
/**
 * linear.mjs — Workspace-aware Linear CLI for skills (no MCP).
 *
 * Resolves the right Linear API key per workspace, then calls the Linear
 * GraphQL API directly. Mirrors the fluid-skills script pattern.
 *
 * Key resolution order (no implicit machine-specific selection — callers
 * pass --workspace explicitly):
 *   1. --workspace <name>        explicit pick from the config file
 *   2. LINEAR_API_KEY env var    fallback only (warns on stderr — a global
 *                                shell export must not silently win)
 *
 * Config: $XDG_CONFIG_HOME/linear-workspaces.json (default ~/.config/...)
 *   {
 *     "workspaces": {
 *       "ricekit": { "keychain": "linear.ricekit" },
 *       "fluid":   { "command": "secret-tool lookup service linear.fluid" },
 *       "acme":    { "env": "ACME_LINEAR_KEY" }
 *     }
 *   }
 * Each workspace entry needs exactly one key source:
 *   "keychain": <service>  macOS Keychain (security find-generic-password)
 *   "command":  <cmd>      any command that prints the key to stdout
 *                          (secret-tool, op read, pass show, …) — the
 *                          cross-platform option
 *   "env":      <VAR>      read the key from a named environment variable
 *   "key":      <key>      plaintext in the config file (chmod 600 it)
 *
 * Usage:
 *   linear.mjs [--workspace <name>] <command> [options]
 *
 * Commands:
 *   workspaces                 show configured workspaces (no network)
 *   whoami
 *   list-teams    [--query <name>]
 *   list-projects [--query <name>]
 *   save-project  --name <name> --team <name|id> [--description <md>] [--id <id>]
 *   list-docs     [--project <name|id>] [--query <title-substring>]
 *   get-doc       <id|slug>
 *   save-doc      --title <t> --project <name|id> [--content <md> | --content-file <path|->] [--id <id>]
 *
 * Output: JSON on stdout. Errors and warnings on stderr, non-zero exit.
 */

import { execFileSync, execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";

const CONFIG_DIR = process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config");
const CONFIG_PATH = path.join(CONFIG_DIR, "linear-workspaces.json");
const LINEAR_API = "https://api.linear.app/graphql";

// --- Args --------------------------------------------------------------

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[name] = next;
      i++;
    } else {
      flags[name] = true;
    }
  } else {
    positional.push(a);
  }
}
const command = positional.shift();

function fail(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

// --- Workspace / key resolution -----------------------------------------

function expandTilde(p) {
  return p.startsWith("~") ? path.join(homedir(), p.slice(1)) : p;
}

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch (e) {
    fail(`could not parse ${CONFIG_PATH}: ${e.message}`);
  }
}

function keychainRead(service) {
  if (platform() !== "darwin") {
    fail(
      `workspace uses "keychain" (macOS-only) but this is ${platform()}. ` +
        `Use "command" instead, e.g. "secret-tool lookup service ${service}" ` +
        `on Linux or "op read op://vault/item/credential" with 1Password.`
    );
  }
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-s", service, "-w"],
      { encoding: "utf8" }
    ).trim();
  } catch {
    fail(
      `Keychain entry "${service}" not found. Add it with:\n` +
        `  security add-generic-password -a "$USER" -s ${service} -w <lin_api_...>`
    );
  }
}

function keyForWorkspace(name, ws) {
  if (ws.keychain) return keychainRead(ws.keychain);
  if (ws.command) {
    try {
      const key = execSync(ws.command, { encoding: "utf8" }).trim();
      if (!key) throw new Error("empty output");
      return key;
    } catch (e) {
      fail(`workspace "${name}" command failed: ${e.message}`);
    }
  }
  if (ws.env) {
    const key = process.env[ws.env];
    if (!key) fail(`workspace "${name}" expects env var ${ws.env}, which is unset`);
    return key;
  }
  if (ws.key) return ws.key;
  fail(
    `workspace "${name}" in ${CONFIG_PATH} has no key source ` +
      `(need one of: "keychain", "command", "env", "key")`
  );
}

function resolveKey() {
  const config = loadConfig();
  const workspaces = config?.workspaces ?? {};

  if (flags.workspace) {
    const ws = workspaces[flags.workspace];
    if (!ws) {
      fail(
        `unknown workspace "${flags.workspace}". Known: ${
          Object.keys(workspaces).join(", ") || "(none — create " + CONFIG_PATH + ")"
        }`
      );
    }
    return { key: keyForWorkspace(flags.workspace, ws), source: `--workspace ${flags.workspace}` };
  }

  if (process.env.LINEAR_API_KEY) {
    console.error(
      "Warning: no --workspace given; falling back to LINEAR_API_KEY env var. " +
        "Pass --workspace to be explicit."
    );
    return { key: process.env.LINEAR_API_KEY, source: "LINEAR_API_KEY env" };
  }

  fail(
    `no API key found. Pass --workspace <name> (configured in ${CONFIG_PATH}) ` +
      `or set LINEAR_API_KEY.`
  );
}

// --- GraphQL --------------------------------------------------------------

let cachedAuth = null;
function getAuth() {
  if (!cachedAuth) cachedAuth = resolveKey();
  return cachedAuth;
}

async function gql(query, variables = {}) {
  const { key, source } = getAuth();
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: key },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    fail(`Linear API ${res.status} (auth: ${source}): ${text}`);
  }
  const json = await res.json();
  if (json.errors) fail(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

function out(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

// --- Entity lookup helpers --------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveTeamId(nameOrId) {
  if (UUID_RE.test(nameOrId)) return nameOrId;
  const data = await gql(
    `query($q: String!) {
       teams(filter: { name: { containsIgnoreCase: $q } }, first: 10) {
         nodes { id name }
       }
     }`,
    { q: nameOrId }
  );
  const exact = data.teams.nodes.find(
    (t) => t.name.toLowerCase() === nameOrId.toLowerCase()
  );
  const team = exact ?? data.teams.nodes[0];
  if (!team) fail(`no team matching "${nameOrId}"`);
  return team.id;
}

async function resolveProjectId(nameOrId) {
  if (UUID_RE.test(nameOrId)) return nameOrId;
  const data = await gql(
    `query($q: String!) {
       projects(filter: { name: { containsIgnoreCase: $q } }, first: 10) {
         nodes { id name }
       }
     }`,
    { q: nameOrId }
  );
  const exact = data.projects.nodes.find(
    (p) => p.name.toLowerCase() === nameOrId.toLowerCase()
  );
  const project = exact ?? data.projects.nodes[0];
  if (!project) fail(`no project matching "${nameOrId}"`);
  return project.id;
}

function readContent() {
  if (flags.content !== undefined && flags["content-file"] !== undefined) {
    fail("pass --content or --content-file, not both");
  }
  if (flags.content !== undefined) return String(flags.content);
  if (flags["content-file"] !== undefined) {
    const p = String(flags["content-file"]);
    return p === "-"
      ? readFileSync(0, "utf8")
      : readFileSync(expandTilde(p), "utf8");
  }
  return undefined;
}

// --- Commands ---------------------------------------------------------------

const DOC_FIELDS = `id slugId title url createdAt updatedAt project { id name }`;

const commands = {
  async workspaces() {
    const config = loadConfig();
    const workspaces = config?.workspaces ?? {};
    const sourceOf = (ws) =>
      ws.keychain ? `keychain:${ws.keychain}`
      : ws.command ? "command"
      : ws.env ? `env:${ws.env}`
      : ws.key ? "plaintext"
      : "MISSING";
    out({
      config: existsSync(CONFIG_PATH) ? CONFIG_PATH : `${CONFIG_PATH} (not found)`,
      envFallback: Boolean(process.env.LINEAR_API_KEY),
      workspaces: Object.fromEntries(
        Object.entries(workspaces).map(([name, ws]) => [name, { source: sourceOf(ws) }])
      ),
    });
  },

  async whoami() {
    const data = await gql(
      `query { viewer { id name email } organization { name urlKey } }`
    );
    out({ auth: getAuth().source, ...data });
  },

  async "list-teams"() {
    const filter = flags.query
      ? `(filter: { name: { containsIgnoreCase: ${JSON.stringify(flags.query)} } }, first: 50)`
      : `(first: 50)`;
    const data = await gql(`query { teams${filter} { nodes { id name key } } }`);
    out(data.teams.nodes);
  },

  async "list-projects"() {
    const filter = flags.query
      ? `(filter: { name: { containsIgnoreCase: ${JSON.stringify(flags.query)} } }, first: 50)`
      : `(first: 50)`;
    const data = await gql(
      `query { projects${filter} {
         nodes { id name url state description teams { nodes { id name } } }
       } }`
    );
    out(data.projects.nodes);
  },

  async "save-project"() {
    if (flags.id) {
      const input = {};
      if (flags.name) input.name = String(flags.name);
      if (flags.description) input.description = String(flags.description);
      const data = await gql(
        `mutation($id: String!, $input: ProjectUpdateInput!) {
           projectUpdate(id: $id, input: $input) {
             success project { id name url }
           }
         }`,
        { id: String(flags.id), input }
      );
      return out(data.projectUpdate);
    }
    if (!flags.name || !flags.team) fail("save-project requires --name and --team (or --id to update)");
    const teamId = await resolveTeamId(String(flags.team));
    const input = { name: String(flags.name), teamIds: [teamId] };
    if (flags.description) input.description = String(flags.description);
    const data = await gql(
      `mutation($input: ProjectCreateInput!) {
         projectCreate(input: $input) { success project { id name url } }
       }`,
      { input }
    );
    out(data.projectCreate);
  },

  async "list-docs"() {
    let nodes;
    if (flags.project) {
      const projectId = await resolveProjectId(String(flags.project));
      const data = await gql(
        `query($id: String!) {
           project(id: $id) { documents(first: 100) { nodes { ${DOC_FIELDS} } } }
         }`,
        { id: projectId }
      );
      nodes = data.project.documents.nodes;
    } else {
      const data = await gql(
        `query { documents(first: 100) { nodes { ${DOC_FIELDS} } } }`
      );
      nodes = data.documents.nodes;
    }
    if (flags.query) {
      const q = String(flags.query).toLowerCase();
      nodes = nodes.filter((d) => d.title.toLowerCase().includes(q));
    }
    out(nodes);
  },

  async "get-doc"() {
    const id = positional[0];
    if (!id) fail("get-doc requires a document id or slug argument");
    const data = await gql(
      `query($id: String!) { document(id: $id) { ${DOC_FIELDS} content } }`,
      { id }
    );
    out(data.document);
  },

  async "save-doc"() {
    const content = readContent();
    if (flags.id) {
      const input = {};
      if (flags.title) input.title = String(flags.title);
      if (content !== undefined) input.content = content;
      const data = await gql(
        `mutation($id: String!, $input: DocumentUpdateInput!) {
           documentUpdate(id: $id, input: $input) {
             success document { ${DOC_FIELDS} }
           }
         }`,
        { id: String(flags.id), input }
      );
      return out(data.documentUpdate);
    }
    if (!flags.title || !flags.project) {
      fail("save-doc requires --title and --project (or --id to update)");
    }
    const projectId = await resolveProjectId(String(flags.project));
    const input = { title: String(flags.title), projectId };
    if (content !== undefined) input.content = content;
    const data = await gql(
      `mutation($input: DocumentCreateInput!) {
         documentCreate(input: $input) { success document { ${DOC_FIELDS} } }
       }`,
      { input }
    );
    out(data.documentCreate);
  },
};

if (!command || !commands[command]) {
  fail(
    `unknown command "${command ?? ""}". Commands: ${Object.keys(commands).join(", ")}`
  );
}

await commands[command]();
