import {
  claudeCodeArgs,
  claudeCodeModelId,
  claudeCodeTools,
  claudeSubscriptionEnv,
  isClaudeCodeModel,
  isClaudeSubscriptionAuth,
  parseClaudeCodeEvent,
} from "./index.js";

describe("Claude Code subscription transport", () => {
  test("recognizes only the explicit first-party provider prefix", () => {
    expect(isClaudeCodeModel("claude-code/claude-fable-5")).toBe(true);
    expect(isClaudeCodeModel("anthropic/claude-fable-5")).toBe(false);
    expect(isClaudeCodeModel("claude-code/")).toBe(false);
    expect(claudeCodeModelId("claude-code/claude-fable-5")).toBe("claude-fable-5");
  });

  test("maps Pi tools to a deduplicated Claude capability set", () => {
    expect(claudeCodeTools("read,grep,find,ls,bash,edit,write")).toEqual([
      "Read",
      "Grep",
      "Glob",
      "Bash",
      "Edit",
      "Write",
    ]);
    expect(claudeCodeTools("none")).toEqual([]);
  });

  test("builds a safe-mode, non-persistent, non-bare invocation", () => {
    const args = claudeCodeArgs({
      model: "claude-code/claude-fable-5",
      prompt: "Review this repository",
      systemPrompt: "You are the architect.",
      tools: "read,grep,find,ls",
      thinking: "minimal",
    });

    expect(args).toEqual(
      expect.arrayContaining([
        "--print",
        "--safe-mode",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--include-partial-messages",
        "dontAsk",
        "claude-fable-5",
        "low",
        "Read,Grep,Glob",
      ]),
    );
    expect(args).not.toContain("--bare");
    expect(args).not.toContain("Bash");
    expect(args.at(-1)).toBe("Review this repository");
  });

  test("removes higher-precedence billing credentials without exposing values", () => {
    const env = claudeSubscriptionEnv({
      ANTHROPIC_API_KEY: "secret-api-key",
      ANTHROPIC_AUTH_TOKEN: "secret-auth-token",
      CLAUDE_CODE_USE_BEDROCK: "1",
      CLAUDE_CODE_OAUTH_TOKEN: "subscription-oauth-token",
      PATH: "/usr/bin",
    });

    expect(env).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(env).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
    expect(env).not.toHaveProperty("CLAUDE_CODE_USE_BEDROCK");
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("subscription-oauth-token");
    expect(env.PATH).toBe("/usr/bin");
  });

  test("accepts only logged-in Claude subscription OAuth methods", () => {
    expect(isClaudeSubscriptionAuth({ loggedIn: true, authMethod: "claude.ai" })).toBe(true);
    expect(isClaudeSubscriptionAuth({ loggedIn: true, authMethod: "oauth_token" })).toBe(true);
    expect(isClaudeSubscriptionAuth({ loggedIn: true, authMethod: "api_key" })).toBe(false);
    expect(isClaudeSubscriptionAuth({ loggedIn: false, authMethod: "claude.ai" })).toBe(false);
    expect(isClaudeSubscriptionAuth(null)).toBe(false);
  });

  test("normalizes init, streaming, assistant, and result events", () => {
    expect(
      parseClaudeCodeEvent({
        type: "system",
        subtype: "init",
        session_id: "session-1",
        apiKeySource: "oauth",
      }),
    ).toEqual([{ type: "session", id: "session-1", apiKeySource: "oauth" }]);
    expect(
      parseClaudeCodeEvent({
        type: "stream_event",
        event: { type: "content_block_delta", delta: { type: "text_delta", text: "hello" } },
      }),
    ).toEqual([{ type: "delta", text: "hello" }]);
    expect(
      parseClaudeCodeEvent({
        type: "assistant",
        message: {
          content: [
            { type: "thinking", thinking: "reason" },
            { type: "tool_use", name: "Read", input: { file_path: "README.md" } },
            { type: "text", text: "answer" },
          ],
          usage: {
            input_tokens: 10,
            cache_read_input_tokens: 20,
            cache_creation_input_tokens: 30,
            output_tokens: 4,
          },
        },
      }),
    ).toEqual([
      {
        type: "assistant",
        text: "answer",
        thinking: "reason",
        tools: [{ name: "Read", input: { file_path: "README.md" } }],
        usage: { input: 10, cacheRead: 20, cacheWrite: 30, output: 4, total: 64 },
      },
    ]);
    expect(
      parseClaudeCodeEvent({
        type: "result",
        subtype: "success",
        result: "final",
        session_id: "session-1",
        total_cost_usd: 0.25,
        usage: { input_tokens: 12, output_tokens: 5 },
      }),
    ).toEqual([
      {
        type: "result",
        text: "final",
        sessionId: "session-1",
        costUsd: 0.25,
        usage: { input: 12, cacheRead: 0, cacheWrite: 0, output: 5, total: 17 },
        error: undefined,
      },
    ]);
  });

  test("ignores malformed or unrelated events", () => {
    expect(parseClaudeCodeEvent(null)).toEqual([]);
    expect(parseClaudeCodeEvent({ type: "rate_limit_event" })).toEqual([]);
    expect(parseClaudeCodeEvent({ type: "assistant", message: { content: "invalid" } })).toEqual(
      [],
    );
  });
});
