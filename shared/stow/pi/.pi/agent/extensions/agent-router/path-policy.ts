import * as path from "node:path";

import type { AgentDefinition, AgentId, PathFinding, PathMode, ProtectedPathPolicy } from "./types";

export function normalizeRepoPath(inputPath: string): string {
  const slashNormalizedPath = inputPath
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/");
  const normalizedPath = path.posix.normalize(slashNormalizedPath);

  return normalizedPath === "." ? "" : normalizedPath.replace(/^\//, "");
}

export function uniquePaths(paths: readonly string[] | undefined): string[] {
  if (!paths) return [];

  const normalizedPaths = paths.map(normalizeRepoPath).filter((path) => path.length > 0);
  return Array.from(new Set(normalizedPaths));
}

export function findPathFinding(
  path: string,
  mode: PathMode,
  agents: readonly AgentDefinition[],
  policies: readonly ProtectedPathPolicy[],
): PathFinding {
  const normalizedPath = normalizeRepoPath(path);
  const protectedBy = policies
    .filter((policy) => matchesAny(policy.patterns, normalizedPath))
    .map((policy) => policy.label);
  const owners = agents
    .filter((agent) => agent.id !== "repo-coordinator" && matchesAny(agent.owns, normalizedPath))
    .map((agent) => agent.id);
  const editableBy = agents
    .filter((agent) => matchesAny(agent.mayEdit, normalizedPath))
    .map((agent) => agent.id);
  const readOnlyForOwner = agents.some((agent) => matchesAny(agent.readOnly, normalizedPath));

  return {
    path: normalizedPath,
    mode,
    owners,
    editableBy,
    protectedBy,
    status: getPathStatus({
      mode,
      owners,
      editableBy,
      protectedBy,
      readOnlyForOwner,
    }),
  };
}

export function matchesAny(patterns: readonly string[], path: string): boolean {
  const normalizedPath = normalizeRepoPath(path);
  return patterns.some((pattern) => matchesPattern(pattern, normalizedPath));
}

function getPathStatus(input: {
  readonly mode: PathMode;
  readonly owners: readonly AgentId[];
  readonly editableBy: readonly AgentId[];
  readonly protectedBy: readonly string[];
  readonly readOnlyForOwner: boolean;
}): "allowed" | "read-only" | "blocked" | "unknown" {
  if (input.mode === "edit" && input.protectedBy.length > 0) return "blocked";
  if (input.mode === "edit" && input.readOnlyForOwner) return "blocked";
  if (input.mode === "edit" && input.editableBy.length > 0) return "allowed";
  if (input.mode === "read" && input.owners.length > 0) return "allowed";
  if (input.mode === "read" && input.protectedBy.length > 0) return "read-only";
  return "unknown";
}

function matchesPattern(pattern: string, path: string): boolean {
  const normalizedPattern = normalizeRepoPath(pattern);
  if (normalizedPattern === "**") return true;
  if (!normalizedPattern.includes("*")) return path === normalizedPattern;

  return new RegExp(`^${globToRegexSource(normalizedPattern)}$`).test(path);
}

function globToRegexSource(pattern: string): string {
  let source = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      source += ".*";
      index += 1;
      continue;
    }
    if (character === "*") {
      source += "[^/]*";
      continue;
    }
    if (character) {
      source += escapeRegexCharacter(character);
    }
  }

  return source;
}

function escapeRegexCharacter(character: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(character) ? `\\${character}` : character;
}
