import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const INLINE_SKILL_PATTERN = /(^|\s)\/skill:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?=$|[\s.,;:!?)}\]])/g;

type PiCommand = ReturnType<ExtensionAPI["getCommands"]>[number];

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

async function readSkillFile(sourcePath: string): Promise<string> {
  const path = expandHome(sourcePath);
  const info = await stat(path);
  const skillPath = info.isDirectory() ? join(path, "SKILL.md") : path;
  return readFile(skillPath, "utf8");
}

function findInlineSkillNames(text: string): string[] {
  const names = new Set<string>();

  for (const match of text.matchAll(INLINE_SKILL_PATTERN)) {
    const name = match[2];
    if (name) names.add(name);
  }

  return [...names];
}

function stripInlineSkillMarkers(text: string): string {
  return text.replaceAll(INLINE_SKILL_PATTERN, "$1").replace(/[ \t]+\n/g, "\n").trim();
}

function findSkillCommand(commands: PiCommand[], name: string): PiCommand | undefined {
  return commands.find(
    (command) => command.source === "skill" && (command.name === `skill:${name}` || command.name === name),
  );
}

function formatLoadedSkills(skills: Array<{ name: string; path: string; content: string }>): string {
  const sections = skills.map(
    (skill) => `<skill name="${skill.name}" path="${skill.path}">\n${skill.content.trim()}\n</skill>`,
  );

  return [
    "The user referenced the following skills inline. Apply these skill instructions where relevant to the user's request.",
    "",
    "<inline_skills>",
    sections.join("\n\n"),
    "</inline_skills>",
  ].join("\n");
}

export default function inlineSkills(pi: ExtensionAPI) {
  pi.on("input", async (event, ctx) => {
    const names = findInlineSkillNames(event.text);
    if (names.length === 0) return { action: "continue" as const };

    const commands = pi.getCommands();
    const loadedSkills: Array<{ name: string; path: string; content: string }> = [];
    const missingSkills: string[] = [];

    for (const name of names) {
      const command = findSkillCommand(commands, name);
      if (!command) {
        missingSkills.push(name);
        continue;
      }

      try {
        loadedSkills.push({
          name,
          path: command.sourceInfo.path,
          content: await readSkillFile(command.sourceInfo.path),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(`Could not load /skill:${name}: ${message}`, "warning");
      }
    }

    if (missingSkills.length > 0) {
      ctx.ui.notify(`Unknown inline skill(s): ${missingSkills.map((name) => `/skill:${name}`).join(", ")}`, "warning");
    }

    if (loadedSkills.length === 0) return { action: "continue" as const };

    const strippedPrompt = stripInlineSkillMarkers(event.text);
    const transformedText = `${formatLoadedSkills(loadedSkills)}\n\nUser request:\n${strippedPrompt}`;

    return {
      action: "transform" as const,
      text: transformedText,
      images: event.images,
    };
  });
}
