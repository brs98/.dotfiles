import { fromPartial } from "@total-typescript/shoehorn";

type RenderedToolResult = {
  content: Array<{
    type: "text";
    text: string;
  }>;
  details: {
    ok: boolean;
  };
};

describe("shoehorn test fixtures", () => {
  it("lets tests pass only the fields they care about", () => {
    const result: RenderedToolResult = fromPartial({
      content: [{ type: "text", text: "ok" }],
    });

    expect(result.content[0]?.text).toBe("ok");
  });
});
