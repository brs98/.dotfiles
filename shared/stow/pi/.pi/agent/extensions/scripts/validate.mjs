import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const extensionsDir = join(scriptDir, "..");

const entries = await readdir(extensionsDir, { withFileTypes: true });
const extensionFiles = entries
  .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
  .map((entry) => join(extensionsDir, entry.name))
  .sort();

if (extensionFiles.length === 0) {
  console.error("No TypeScript extensions found in extensions/");
  process.exit(1);
}

const errors = [];

for (const extensionFile of extensionFiles) {
  try {
    await esbuild.build({
      entryPoints: [extensionFile],
      bundle: false,
      write: false,
      format: "esm",
      platform: "node",
      logLevel: "silent",
      sourcemap: false,
    });
  } catch (error) {
    const message = error.errors?.map((item) => item.text).join("; ") || error.message;
    errors.push(`${extensionFile}: ${message}`);
  }
}

if (errors.length > 0) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(
  `validated ${extensionFiles.length} pi extension${extensionFiles.length === 1 ? "" : "s"}`,
);
