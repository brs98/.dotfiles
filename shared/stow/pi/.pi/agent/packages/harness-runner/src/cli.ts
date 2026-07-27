#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RESOURCE_FLAGS = {
  extensions: { disable: "--no-extensions", load: "-e" },
  skills: { disable: "--no-skills", load: "--skill" },
  prompts: { disable: "--no-prompt-templates", load: "--prompt-template" },
  themes: { disable: "--no-themes", load: "--theme" },
} as const;

const PROVIDE_KINDS = ["tools", "commands", "flags", "shortcuts", "uiSlots"] as const;
const RESERVED_HARNESS_NAMES = new Set([
  "config",
  "harness",
  "install",
  "list",
  "remove",
  "uninstall",
  "update",
  "upstream",
]);

type ResourceKind = keyof typeof RESOURCE_FLAGS;
type ResourcePolicy = "discover" | "explicit";
type JsonRecord = Record<string, unknown>;

interface Provides {
  readonly tools: readonly string[];
  readonly commands: readonly string[];
  readonly flags: readonly string[];
  readonly shortcuts: readonly string[];
  readonly uiSlots: readonly string[];
}

interface LocalExtension {
  readonly path: string;
  readonly provides: Provides;
}

interface HarnessManifest {
  readonly name: string;
  readonly description: string;
  readonly resources: Readonly<Record<ResourceKind, ResourcePolicy>>;
  readonly packages: readonly string[];
  readonly extensions: readonly LocalExtension[];
  readonly piArguments: readonly string[];
}

interface ResolvedResource {
  readonly kind: ResourceKind;
  readonly path: string;
  readonly owner: string;
}

interface Contribution {
  readonly owner: string;
  readonly provides: Provides;
}

export interface ResolvedHarness {
  readonly manifest: HarnessManifest;
  readonly resources: readonly ResolvedResource[];
  readonly arguments: readonly string[];
}

const agentRoot = fileURLToPath(new URL("../../..", import.meta.url));

function fail(message: string): never {
  throw new Error(message);
}

function asRecord(value: unknown, label: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as JsonRecord;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  return value;
}

function stringList(value: unknown, label: string): readonly string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array`);

  return value.map((item, index) => stringValue(item, `${label}[${index}]`));
}

function stringArray(value: unknown, label: string): readonly string[] {
  const result = stringList(value, label);
  if (new Set(result).size !== result.length) fail(`${label} contains duplicates`);
  return result;
}

function parseProvides(value: unknown, label: string): Provides {
  const record = value === undefined ? {} : asRecord(value, label);
  return {
    tools: stringArray(record.tools, `${label}.tools`),
    commands: stringArray(record.commands, `${label}.commands`),
    flags: stringArray(record.flags, `${label}.flags`),
    shortcuts: stringArray(record.shortcuts, `${label}.shortcuts`),
    uiSlots: stringArray(record.uiSlots, `${label}.uiSlots`),
  };
}

function parseManifest(value: unknown, label: string): HarnessManifest {
  const record = asRecord(value, label);
  const resourceRecord = asRecord(record.resources, `${label}.resources`);
  const resources = Object.fromEntries(
    Object.keys(RESOURCE_FLAGS).map((kind) => {
      const policy = resourceRecord[kind];
      if (policy !== "discover" && policy !== "explicit") {
        fail(`${label}.resources.${kind} must be "discover" or "explicit"`);
      }
      return [kind, policy];
    }),
  ) as Record<ResourceKind, ResourcePolicy>;

  const extensionValues = record.extensions ?? [];
  if (!Array.isArray(extensionValues)) fail(`${label}.extensions must be an array`);
  const extensions = extensionValues.map((item, index) => {
    const extension = asRecord(item, `${label}.extensions[${index}]`);
    return {
      path: stringValue(extension.path, `${label}.extensions[${index}].path`),
      provides: parseProvides(extension.provides, `${label}.extensions[${index}].provides`),
    } satisfies LocalExtension;
  });

  return {
    name: stringValue(record.name, `${label}.name`),
    description: stringValue(record.description, `${label}.description`),
    resources,
    packages: stringArray(record.packages, `${label}.packages`),
    extensions,
    piArguments: stringList(record.piArguments, `${label}.piArguments`),
  };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`${path} is not valid JSON: ${message}`);
  }
}

function resolveInside(base: string, path: string, boundary: string, label: string): string {
  if (/[*?{}[\]]/.test(path)) fail(`${label} must be an exact path; globs are not supported`);
  const resolvedPath = resolve(base, path);
  const fromBoundary = relative(boundary, resolvedPath);
  if (fromBoundary.startsWith("..") || isAbsolute(fromBoundary)) {
    fail(`${label} resolves outside ${boundary}`);
  }
  if (!existsSync(resolvedPath)) fail(`${label} does not exist: ${resolvedPath}`);
  return resolvedPath;
}

async function packageIndex(root: string): Promise<Map<string, { dir: string; json: JsonRecord }>> {
  const packagesRoot = resolve(root, "packages");
  const entries = await readdir(packagesRoot, { withFileTypes: true });
  const packages = new Map<string, { dir: string; json: JsonRecord }>();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = resolve(packagesRoot, entry.name);
    const packagePath = resolve(dir, "package.json");
    if (!existsSync(packagePath)) continue;
    const json = asRecord(await readJson(packagePath), packagePath);
    const name = stringValue(json.name, `${packagePath}.name`);
    if (packages.has(name)) fail(`duplicate workspace package name: ${name}`);
    packages.set(name, { dir, json });
  }

  return packages;
}

function packageResources(
  owner: string,
  dir: string,
  json: JsonRecord,
  root: string,
): readonly ResolvedResource[] {
  if (json.pi === undefined) return [];
  const pi = asRecord(json.pi, `${owner}.pi`);
  const resources: ResolvedResource[] = [];

  for (const kind of Object.keys(RESOURCE_FLAGS) as ResourceKind[]) {
    for (const resourcePath of stringArray(pi[kind], `${owner}.pi.${kind}`)) {
      resources.push({
        kind,
        path: resolveInside(dir, resourcePath, root, `${owner}.pi.${kind}`),
        owner,
      });
    }
  }

  return resources;
}

export function assertNoCollisions(contributions: readonly Contribution[]): void {
  for (const kind of PROVIDE_KINDS) {
    const owners = new Map<string, string>();
    for (const contribution of contributions) {
      for (const name of contribution.provides[kind]) {
        const previousOwner = owners.get(name);
        if (previousOwner && previousOwner !== contribution.owner) {
          fail(`${kind} collision for "${name}": ${previousOwner} and ${contribution.owner}`);
        }
        owners.set(name, contribution.owner);
      }
    }
  }
}

export async function resolveHarness(name: string, root = agentRoot): Promise<ResolvedHarness> {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) fail(`invalid harness name: ${name}`);
  if (RESERVED_HARNESS_NAMES.has(name)) fail(`reserved harness name: ${name}`);

  const harnessDir = resolve(root, "harnesses", name);
  const manifestPath = resolve(harnessDir, "harness.json");
  const packagePath = resolve(harnessDir, "package.json");
  if (!existsSync(manifestPath)) fail(`unknown harness: ${name}`);

  const manifest = parseManifest(await readJson(manifestPath), manifestPath);
  if (manifest.name !== name) {
    fail(`${manifestPath}.name must match its directory name "${name}"`);
  }

  const harnessPackage = asRecord(await readJson(packagePath), packagePath);
  const dependencies = asRecord(harnessPackage.dependencies ?? {}, `${packagePath}.dependencies`);
  const packages = await packageIndex(root);
  const resources: ResolvedResource[] = [];
  const contributions: Contribution[] = [];

  for (const packageName of manifest.packages) {
    const workspacePackage = packages.get(packageName);
    if (!workspacePackage) fail(`${name} references unknown workspace package ${packageName}`);
    if (dependencies[packageName] !== "workspace:*") {
      fail(`${name} must declare ${packageName} as a workspace:* dependency`);
    }

    resources.push(
      ...packageResources(packageName, workspacePackage.dir, workspacePackage.json, root),
    );
    const metadata = asRecord(workspacePackage.json.piHarness ?? {}, `${packageName}.piHarness`);
    contributions.push({
      owner: packageName,
      provides: parseProvides(metadata.provides, `${packageName}.piHarness.provides`),
    });
  }

  for (const extension of manifest.extensions) {
    resources.push({
      kind: "extensions",
      path: resolveInside(harnessDir, extension.path, root, `${name}.extensions.path`),
      owner: `${name}:${extension.path}`,
    });
    contributions.push({ owner: `${name}:${extension.path}`, provides: extension.provides });
  }

  assertNoCollisions(contributions);

  const args: string[] = [];
  for (const kind of Object.keys(RESOURCE_FLAGS) as ResourceKind[]) {
    const flags = RESOURCE_FLAGS[kind];
    if (manifest.resources[kind] === "explicit") args.push(flags.disable);
    for (const resource of resources.filter((candidate) => candidate.kind === kind)) {
      args.push(flags.load, resource.path);
    }
  }
  args.push(...manifest.piArguments);

  return { manifest, resources, arguments: args };
}

async function harnessNames(root = agentRoot): Promise<readonly string[]> {
  const entries = await readdir(resolve(root, "harnesses"), { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isDirectory() && existsSync(resolve(root, "harnesses", entry.name, "harness.json")),
    )
    .map((entry) => entry.name)
    .sort();
}

function usage(): string {
  return [
    "Usage:",
    "  pi-harness list",
    "  pi-harness explain <name> [--json]",
    "  pi-harness exists <name>",
    "  pi-harness validate [name]",
    "  pi-harness run <name> [pi arguments...]",
    "  pi-harness <name> [pi arguments...]",
  ].join("\n");
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(usage());
    return 0;
  }

  if (command === "list") {
    for (const name of await harnessNames()) {
      const resolved = await resolveHarness(name);
      console.log(`${name}\t${resolved.manifest.description}`);
    }
    return 0;
  }

  if (command === "validate") {
    const names = rest[0] ? [rest[0]] : await harnessNames();
    for (const name of names) {
      const resolved = await resolveHarness(name);
      console.log(`validated ${name} (${resolved.resources.length} explicit resources)`);
    }
    return 0;
  }

  if (command === "exists") {
    const name = rest[0];
    if (!name) fail("exists requires a harness name");
    try {
      await resolveHarness(name);
      return 0;
    } catch {
      return 1;
    }
  }

  if (command === "explain") {
    const name = rest[0];
    if (!name) fail("explain requires a harness name");
    const resolved = await resolveHarness(name);
    if (rest.includes("--json")) {
      console.log(JSON.stringify(resolved, null, 2));
    } else {
      console.log(`${resolved.manifest.name}: ${resolved.manifest.description}`);
      console.log(`pi ${resolved.arguments.join(" ")}`);
    }
    return 0;
  }

  const name = command === "run" ? rest.shift() : command;
  if (!name) fail("run requires a harness name");
  const resolved = await resolveHarness(name);
  const piBinary = process.env.PI_HARNESS_PI_BIN || "pi";
  const result = spawnSync(piBinary, [...resolved.arguments, ...rest], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) fail(`could not start ${piBinary}: ${result.error.message}`);
  return result.status ?? 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .then((status) => {
      process.exitCode = status;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
