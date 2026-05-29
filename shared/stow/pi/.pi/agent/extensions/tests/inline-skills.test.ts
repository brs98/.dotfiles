jest.mock(
  "@earendil-works/pi-coding-agent",
  () => ({
    CustomEditor: class CustomEditor {},
  }),
  { virtual: true },
);

let formatLoadedSkillPrompt: typeof import("../inline-skills.js").formatLoadedSkillPrompt;
let formatLoadedSkills: typeof import("../inline-skills.js").formatLoadedSkills;

beforeAll(async () => {
  ({ formatLoadedSkillPrompt, formatLoadedSkills } = await import("../inline-skills.js"));
});

describe("inline skill prompt formatting", () => {
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
