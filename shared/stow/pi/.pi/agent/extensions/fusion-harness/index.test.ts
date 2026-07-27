import {
  claudeCodeArgs,
  claudeCodeModelId,
  claudeCodeTools,
  claudeSubscriptionEnv,
  captureDiagnosticStderr,
  formatChildFailure,
  isClaudeCodeModel,
  isClaudeSubscriptionAuth,
  parseClaudeCodeEvent,
  redactDiagnosticText,
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

  test("normalizes rejected rate limits and stream API errors", () => {
    expect(
      parseClaudeCodeEvent({
        type: "rate_limit_event",
        rate_limit_info: {
          status: "rejected",
          rateLimitType: "five_hour",
          resetsAt: 1_784_670_000,
        },
      }),
    ).toEqual([
      {
        type: "error",
        message: "Claude Code rate limit rejected the request (five_hour; resets 2026-07-21T21:40:00.000Z)",
      },
    ]);
    expect(
      parseClaudeCodeEvent({
        type: "stream_event",
        event: {
          type: "error",
          error: { type: "overloaded_error", message: "Service overloaded" },
        },
      }),
    ).toEqual([{ type: "error", message: "overloaded_error: Service overloaded" }]);
    expect(
      parseClaudeCodeEvent({
        type: "result",
        subtype: "error_during_execution",
        result: "API Error: 429 rate limit",
      }),
    ).toEqual([
      {
        type: "result",
        text: "API Error: 429 rate limit",
        sessionId: undefined,
        usage: undefined,
        costUsd: 0,
        error: "API Error: 429 rate limit",
      },
    ]);
  });

  test("redacts credentials from persisted child diagnostics", () => {
    const stderr = [
      "ANTHROPIC_API_KEY=inline-secret",
      "Authorization: Bearer bearer-secret",
      "helper failed with env-secret-token",
      '{"ANTHROPIC_AUTH_TOKEN":"json-secret","Authorization":"Bearer json-bearer"}',
      '{"apiKey":"camel-secret","access_token":"snake-secret","token":"generic-secret"}',
      "ordinary diagnostic",
    ].join("\n");
    const redacted = redactDiagnosticText(stderr, {
      CLAUDE_CODE_OAUTH_TOKEN: "env-secret-token",
    });

    expect(redacted).not.toContain("inline-secret");
    expect(redacted).not.toContain("bearer-secret");
    expect(redacted).not.toContain("env-secret-token");
    expect(redacted).not.toContain("json-secret");
    expect(redacted).not.toContain("json-bearer");
    expect(redacted).not.toContain("camel-secret");
    expect(redacted).not.toContain("snake-secret");
    expect(redacted).not.toContain("generic-secret");
    expect(redacted).toContain("ANTHROPIC_API_KEY=[REDACTED]");
    expect(redacted).toContain("Authorization: Bearer [REDACTED]");
    expect(redacted).toContain("ordinary diagnostic");
  });

  test("formats a pre-init child exit with its signal and sanitized stderr", () => {
    const failure = formatChildFailure(
      "Claude Code exited before reporting its authentication source (token=message-secret)",
      1,
      "SIGTERM",
      "ANTHROPIC_AUTH_TOKEN=do-not-persist\nstartup failed",
      { AUTH_TOKEN: "message-secret" },
    );

    expect(failure).toContain("Claude Code exited before reporting its authentication source");
    expect(failure).toContain("exit 1 · signal SIGTERM");
    expect(failure).toContain("ANTHROPIC_AUTH_TOKEN=[REDACTED]");
    expect(failure).toContain("startup failed");
    expect(failure).not.toContain("do-not-persist");
    expect(failure).not.toContain("message-secret");
  });

  test("redacts credential values split across stderr chunks", () => {
    let captured = captureDiagnosticStderr("", "ANTHROPIC_AUTH_TOKEN=split-");
    captured = captureDiagnosticStderr(captured, "secret\nstartup failed");
    const failure = formatChildFailure("child failed", 1, undefined, captured, {});

    expect(failure).toContain("ANTHROPIC_AUTH_TOKEN=[REDACTED]");
    expect(failure).toContain("startup failed");
    expect(failure).not.toContain("split-secret");
  });

  test("discards later chunks until an omitted oversized stderr line ends", () => {
    let captured = captureDiagnosticStderr("", `AUTH_TOKEN=${"x".repeat(70_000)}`);
    captured = captureDiagnosticStderr(captured, "secret-suffix\nstartup failed safely");
    const failure = formatChildFailure("child failed", 1, undefined, captured, {});

    expect(failure).toContain("oversized stderr line omitted");
    expect(failure).toContain("startup failed safely");
    expect(failure).not.toContain("secret-suffix");
  });

  test("tolerates an out-of-range rate-limit reset timestamp", () => {
    expect(
      parseClaudeCodeEvent({
        type: "rate_limit_event",
        rate_limit_info: { status: "rejected", resetsAt: 1e300 },
      }),
    ).toEqual([{ type: "error", message: "Claude Code rate limit rejected the request" }]);
  });

  test("bounds persisted stderr while retaining the actionable tail", () => {
    const failure = formatChildFailure(
      "child failed",
      1,
      undefined,
      `${"old output\n".repeat(600)}final actionable failure`,
      {},
    );

    expect(failure).toContain("earlier stderr truncated");
    expect(failure).toContain("final actionable failure");
    expect(failure.length).toBeLessThan(4_200);
  });

  test("ignores malformed or unrelated events", () => {
    expect(parseClaudeCodeEvent(null)).toEqual([]);
    expect(parseClaudeCodeEvent({ type: "rate_limit_event" })).toEqual([]);
    expect(parseClaudeCodeEvent({ type: "rate_limit_event", rate_limit_info: { status: "allowed" } })).toEqual([]);
    expect(parseClaudeCodeEvent({ type: "assistant", message: { content: "invalid" } })).toEqual(
      [],
    );
  });
});
