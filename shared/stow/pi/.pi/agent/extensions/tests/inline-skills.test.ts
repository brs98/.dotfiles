jest.mock(
  "@earendil-works/pi-coding-agent",
  () => ({
    CustomEditor: class CustomEditor {},
  }),
  { virtual: true },
);

let formatInlineSkillPromptText: typeof import("../inline-skills.js").formatInlineSkillPromptText;
let formatLoadedSkillPrompt: typeof import("../inline-skills.js").formatLoadedSkillPrompt;
let formatLoadedSkills: typeof import("../inline-skills.js").formatLoadedSkills;

const commands = [
  { name: "skill:review", source: "skill" },
  { name: "skill:tdd", source: "skill" },
] as Parameters<typeof formatInlineSkillPromptText>[1];

beforeAll(async () => {
  ({ formatInlineSkillPromptText, formatLoadedSkillPrompt, formatLoadedSkills } =
    await import("../inline-skills.js"));
});

describe("inline skill prompt formatting", () => {
  it("keeps inline skill references as grammar words in the visible prompt", () => {
    expect(
      formatInlineSkillPromptText("let's use subagents to /skill:review this PR", commands),
    ).toBe("let's use subagents to review this PR");
  });

  it("keeps shorthand inline skill references as grammar words", () => {
    expect(formatInlineSkillPromptText("fix this with /tdd please", commands)).toBe(
      "fix this with tdd please",
    );
  });

  it("keeps marker-only prompts terse", () => {
    expect(formatInlineSkillPromptText("/skill:tdd", commands)).toBe("");
  });

  it("shows only a short loaded marker plus the user request", () => {
    expect(formatLoadedSkillPrompt([{ name: "tdd" }], "fix this bug")).toBe(
      "Loaded skill: **tdd**.\n\nfix this bug",
    );
  });

  it("shows only the loaded marker when the skill marker was the whole prompt", () => {
    expect(formatLoadedSkillPrompt([{ name: "brainstorming" }], "")).toBe(
      "Loaded skill: **brainstorming**.",
    );
  });

  it("keeps full skill contents in hidden context", () => {
    expect(
      formatLoadedSkills([{ name: "tdd", path: "/skills/tdd/SKILL.md", content: "# TDD" }]),
    ).toContain('<skill name="tdd" path="/skills/tdd/SKILL.md">\n# TDD\n</skill>');
  });
});
