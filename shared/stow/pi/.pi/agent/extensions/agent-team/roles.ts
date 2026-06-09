import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type RoleName =
  | "interpreter"
  | "researcher"
  | "spec-writer"
  | "builder"
  | "tester"
  | "reviewer";
export type RoleScope = "user" | "project" | "both";
export type RoleSource = "bundled" | "user" | "project";

export type TeamRole = {
  name: RoleName;
  description: string;
  tools: string[];
  model?: string;
  prompt: string;
  source: RoleSource;
  filePath: string;
};

type RawRoleFrontmatter = {
  name?: string;
  description?: string;
  tools?: string;
  model?: string;
};

export const ROLE_NAMES: readonly RoleName[] = [
  "interpreter",
  "researcher",
  "spec-writer",
  "builder",
  "tester",
  "reviewer",
];

export function isRoleName(value: string | undefined): value is RoleName {
  return ROLE_NAMES.includes(value as RoleName);
}

function getExtensionDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function getBundledRolesDir(): string {
  return join(getExtensionDir(), "roles");
}

function nearestProjectRolesDir(cwd: string): string | null {
  let current = cwd;
  while (true) {
    const candidate = join(current, ".pi", "agent-team", "roles");
    try {
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      // keep walking upward
    }

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function parseTools(value: string | undefined): string[] {
  if (!value) return [];
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "none") return [];
  return value
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
}

function loadRolesFromDir(dir: string, source: RoleSource): TeamRole[] {
  if (!existsSync(dir)) return [];

  const roles: TeamRole[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;

    const filePath = join(dir, entry.name);
    let content: string;
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter<RawRoleFrontmatter>(content);
    const roleName = frontmatter.name ?? basename(entry.name, ".md");
    if (!isRoleName(roleName)) continue;

    roles.push({
      name: roleName,
      description: frontmatter.description ?? `${roleName} role`,
      tools: parseTools(frontmatter.tools),
      model: frontmatter.model?.trim() || undefined,
      prompt: body.trim(),
      source,
      filePath,
    });
  }

  return roles;
}

export function discoverRoles(
  cwd: string,
  scope: RoleScope,
): { roles: Map<RoleName, TeamRole>; projectRolesDir: string | null } {
  const roles = new Map<RoleName, TeamRole>();
  const projectRolesDir = nearestProjectRolesDir(cwd);
  const dirs: Array<{ dir: string; source: RoleSource }> = [
    { dir: getBundledRolesDir(), source: "bundled" },
  ];

  if (scope === "user" || scope === "both") {
    dirs.push({ dir: join(getAgentDir(), "agent-team", "roles"), source: "user" });
  }
  if ((scope === "project" || scope === "both") && projectRolesDir) {
    dirs.push({ dir: projectRolesDir, source: "project" });
  }

  for (const item of dirs) {
    for (const role of loadRolesFromDir(item.dir, item.source)) roles.set(role.name, role);
  }

  return { roles, projectRolesDir };
}

export function assertRequiredRoles(roles: Map<RoleName, TeamRole>): string | undefined {
  const missing = ROLE_NAMES.filter((role) => !roles.has(role));
  if (missing.length === 0) return undefined;
  return `Missing agent-team role definitions: ${missing.join(", ")}. Expected bundled roles in ${getBundledRolesDir()}.`;
}

export function roleOrThrow(roles: Map<RoleName, TeamRole>, name: RoleName): TeamRole {
  const role = roles.get(name);
  if (!role) throw new Error(`Missing role: ${name}`);
  return role;
}
