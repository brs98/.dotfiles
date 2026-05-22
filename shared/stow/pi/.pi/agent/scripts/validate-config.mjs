import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const agentRoot = join(scriptDir, "..");

const errors = [];

async function requireFile(relativePath) {
  const path = join(agentRoot, relativePath);
  try {
    const info = await stat(path);
    if (!info.isFile()) errors.push(`${relativePath} exists but is not a file`);
    return path;
  } catch {
    errors.push(`${relativePath} is missing`);
    return path;
  }
}

const agentsPath = await requireFile("AGENTS.md");
const mcpPath = await requireFile("mcp.json");

try {
  const text = await readFile(agentsPath, "utf8");
  if (text.trim().length === 0) errors.push("AGENTS.md must not be empty");
} catch (error) {
  errors.push(`AGENTS.md could not be read: ${error.message}`);
}

try {
  const text = await readFile(mcpPath, "utf8");
  const config = JSON.parse(text);

  if (!config || typeof config !== "object" || Array.isArray(config)) {
    errors.push("mcp.json must contain a JSON object");
  } else if (!config.servers || typeof config.servers !== "object" || Array.isArray(config.servers)) {
    errors.push("mcp.json must contain a servers object");
  } else {
    for (const [name, server] of Object.entries(config.servers)) {
      if (!server || typeof server !== "object" || Array.isArray(server)) {
        errors.push(`mcp.json server ${name} must be an object`);
        continue;
      }

      if (typeof server.type !== "string") {
        errors.push(`mcp.json server ${name} must declare a string type`);
      }

      if (server.headers && typeof server.headers === "object" && !Array.isArray(server.headers)) {
        for (const [headerName, headerValue] of Object.entries(server.headers)) {
          const looksSensitive = /TOKEN|KEY|SECRET|PASSWORD/i.test(headerName);
          const isEnvReference = typeof headerValue === "string" && headerValue.startsWith("$");
          if (looksSensitive && !isEnvReference) {
            errors.push(`mcp.json header ${name}.${headerName} should reference an environment variable, not a literal value`);
          }
        }
      }
    }
  }
} catch (error) {
  errors.push(`mcp.json is not valid JSON: ${error.message}`);
}

for (const relativePath of [
  "auth.json",
  "settings.json",
  "run-history.jsonl",
  "pi-crash.log",
  "sessions",
]) {
  try {
    await stat(join(agentRoot, relativePath));
    errors.push(`${relativePath} should stay local and must not be tracked in this stow package`);
  } catch {
    // Expected: local runtime state is not part of the managed package.
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log("pi agent config is valid");
