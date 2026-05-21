import { CustomEditor, type ExtensionAPI, type KeybindingsManager } from "@earendil-works/pi-coding-agent";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const INLINE_SKILL_PATTERN = /(^|\s)\/skill:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)(?=$|[\s.,;:!?)}\]])/g;

const TOKEN_SEPARATORS = new Set([" ", "\t", "\n", "(", "[", "{"]);

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

function findInlineSkillNames(text: string, commands: PiCommand[]): { names: string[]; missingSkills: string[] } {
  const names = new Set<string>();
  const missingSkills = new Set<string>();

  for (const match of text.matchAll(INLINE_SKILL_PATTERN)) {
    const name = match[2];
    if (!name) continue;

    if (findSkillCommand(commands, name)) {
      names.add(name);
    } else {
      missingSkills.add(name);
    }
  }

  return { names: [...names], missingSkills: [...missingSkills] };
}

function stripInlineSkillMarkers(text: string, commands: PiCommand[]): string {
  return text
    .replaceAll(INLINE_SKILL_PATTERN, (match, leadingWhitespace: string, name: string) => {
      if (!findSkillCommand(commands, name)) return match;
      return leadingWhitespace;
    })
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function findSkillCommand(commands: PiCommand[], name: string): PiCommand | undefined {
  return commands.find(
    (command) => command.source === "skill" && (command.name === `skill:${name}` || command.name === name),
  );
}

function getSkillName(command: PiCommand): string {
  return command.name.startsWith("skill:") ? command.name.slice("skill:".length) : command.name;
}

function getCurrentToken(text: string): { token: string; tokenStart: number } {
  let tokenStart = text.length;

  while (tokenStart > 0 && !TOKEN_SEPARATORS.has(text[tokenStart - 1] ?? "")) {
    tokenStart -= 1;
  }

  return { token: text.slice(tokenStart), tokenStart };
}

function getInlineSkillAutocompletePrefix(textBeforeCursor: string): string | undefined {
  const { token, tokenStart } = getCurrentToken(textBeforeCursor);

  // Keep pi's built-in slash-command menu at the beginning of a prompt/line.
  // This provider is only for inline skill references inside a larger prompt.
  if (textBeforeCursor.slice(0, tokenStart).trim().length === 0) return undefined;

  if (token === "/") return token;
  if ("/skill:".startsWith(token)) return token;
  if (token.startsWith("/")) return token;

  return undefined;
}

function getInlineSkillAutocompleteQuery(prefix: string): string {
  if (prefix === "/") return "";
  if (prefix.startsWith("/skill:")) return prefix.slice("/skill:".length);

  // While the user is typing the explicit marker (`/s`, `/sk`, `/skill`),
  // show all skills so autocomplete can complete the marker to `/skill:name`.
  if ("/skill:".startsWith(prefix)) return "";

  // Shorthand inline completion: `/td` can complete to `/skill:tdd`.
  return prefix.slice(1);
}

function getInlineSkillAutocompleteItems(commands: PiCommand[], prefix: string) {
  const query = getInlineSkillAutocompleteQuery(prefix);

  return commands
    .filter((command) => command.source === "skill")
    .map((command) => {
      const skillName = getSkillName(command);
      return {
        value: `/skill:${skillName}`,
        label: `/skill:${skillName}`,
        description: command.description,
      };
    })
    .filter((item) => item.value.slice("/skill:".length).startsWith(query))
    .sort((a, b) => a.value.localeCompare(b.value));
}

type AutocompleteTriggerableEditor = CustomEditor & { tryTriggerAutocomplete(): void };

class InlineSkillEditor extends CustomEditor {
  private baseEditor?: CustomEditor;
  private keybindings: KeybindingsManager;
  private onSubmitAttempt: () => void;

  constructor(
    tui: ConstructorParameters<typeof CustomEditor>[0],
    theme: ConstructorParameters<typeof CustomEditor>[1],
    keybindings: KeybindingsManager,
    onSubmitAttempt: () => void,
    baseEditor?: CustomEditor,
  ) {
    super(tui, theme, keybindings);
    this.keybindings = keybindings;
    this.onSubmitAttempt = onSubmitAttempt;
    this.baseEditor = baseEditor;
  }

  override handleInput(data: string): void {
    const isSubmitting = this.keybindings.matches(data, "tui.input.submit");
    if (isSubmitting && this.getText().trim().length > 0) {
      this.emitStartupBannerDismissal();
    }

    this.baseEditor?.handleInput(data);
    super.handleInput(data);
    this.triggerInlineSkillAutocomplete();
  }

  private emitStartupBannerDismissal(): void {
    // Slash commands are handled before pi's input/before_agent_start events.
    // Emit a UI-level signal so the startup banner can still disappear when
    // the first submitted prompt is a command such as /reload or /fork.
    this.onSubmitAttempt();
  }

  private triggerInlineSkillAutocomplete(): void {
    if (this.isShowingAutocomplete()) return;

    const cursor = this.getCursor();
    const line = this.getLines()[cursor.line] ?? "";
    const beforeCursor = line.slice(0, cursor.col);
    const prefix = getInlineSkillAutocompletePrefix(beforeCursor);
    if (!prefix) return;

    (this as AutocompleteTriggerableEditor).tryTriggerAutocomplete();
  }
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
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.addAutocompleteProvider((current) => ({
      async getSuggestions(lines, cursorLine, cursorCol, options) {
        const line = lines[cursorLine] ?? "";
        const beforeCursor = line.slice(0, cursorCol);
        const prefix = getInlineSkillAutocompletePrefix(beforeCursor);

        if (!prefix) return current.getSuggestions(lines, cursorLine, cursorCol, options);

        const items = getInlineSkillAutocompleteItems(pi.getCommands(), prefix);
        if (items.length === 0) return current.getSuggestions(lines, cursorLine, cursorCol, options);

        return { prefix, items };
      },
      applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
        return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
      },
      shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
        return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
      },
    }));

    const previousFactory = ctx.ui.getEditorComponent();
    ctx.ui.setEditorComponent((tui, theme, keybindings) => {
      const baseEditor = previousFactory?.(tui, theme, keybindings);
      return new InlineSkillEditor(
        tui,
        theme,
        keybindings,
        () => pi.events.emit("devx:startup-banner:dismiss", { source: "editor-submit" }),
        baseEditor ?? undefined,
      );
    });
  });

  pi.on("input", async (event, ctx) => {
    const commands = pi.getCommands();
    const { names, missingSkills } = findInlineSkillNames(event.text, commands);
    if (names.length === 0 && missingSkills.length === 0) return { action: "continue" as const };
    const loadedSkills: Array<{ name: string; path: string; content: string }> = [];

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

    const strippedPrompt = stripInlineSkillMarkers(event.text, commands);
    const transformedText = `${formatLoadedSkills(loadedSkills)}\n\nUser request:\n${strippedPrompt}`;

    return {
      action: "transform" as const,
      text: transformedText,
      images: event.images,
    };
  });
}
