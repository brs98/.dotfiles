# Pi Extension Authoring Reference

## Resource locations

### Context and system prompt files

- Global context: `~/.pi/agent/AGENTS.md`, fallback `CLAUDE.md`
- Project context: `AGENTS.md` or `CLAUDE.md` from parent directories through cwd
- Replace system prompt: `.pi/SYSTEM.md`, `~/.pi/agent/SYSTEM.md`
- Append system prompt: `.pi/APPEND_SYSTEM.md`, `~/.pi/agent/APPEND_SYSTEM.md`

Use `/reload` after editing context files.

### Skills

Locations:

- `~/.pi/agent/skills/`
- `~/.agents/skills/`
- `.pi/skills/`
- `.agents/skills/`
- package `skills/`

Required shape:

```md
---
name: my-skill
description: What this skill does. Use when specific triggers apply.
---

# My Skill

Instructions...
```

Notes:

- Description is what the agent sees before loading the skill.
- Missing description means the skill is not loaded.
- `/skill:name` forces invocation.
- Keep `SKILL.md` compact; put long material in nearby reference files.

### Prompt templates

Locations:

- `~/.pi/agent/prompts/*.md`
- `.pi/prompts/*.md`
- package `prompts/`

Example:

```md
---
description: Review staged changes
argument-hint: "[focus]"
---

Review `git diff --cached`. Focus on: $ARGUMENTS
```

Invocation:

```text
/review security
```

Supported arguments include `$1`, `$2`, `$@`, `$ARGUMENTS`, `${@:N}`, and `${@:N:L}`.

### Themes

Locations:

- `~/.pi/agent/themes/*.json`
- `.pi/themes/*.json`
- package `themes/`

Best practices:

- Start from built-in `dark` or `light`.
- Include `$schema` for editor validation.
- Use `vars` for palette consistency.
- Test contrast, diffs, markdown, and long tool output.

## TypeScript extensions

### Locations

- `~/.pi/agent/extensions/*.ts`
- `~/.pi/agent/extensions/*/index.ts`
- `.pi/extensions/*.ts`
- `.pi/extensions/*/index.ts`
- package `extensions/`

Quick test:

```bash
pi -e ./my-extension.ts
```

### Minimal extension

```ts
export default function (pi) {
  pi.registerCommand("hello", {
    description: "Say hello",
    handler: async (args, ctx) => {
      ctx.ui.notify(`Hello ${args || "world"}!`, "info");
    },
  });
}
```

Async startup is supported. Use it when initialization should complete before Pi starts, such as fetching a remote model list before registering a custom provider.

### Main capabilities

Extensions can:

- Register LLM-callable tools.
- Register slash commands.
- Register keyboard shortcuts.
- Register custom CLI flags.
- Register or override model providers.
- Hook lifecycle events.
- Send assistant/user messages.
- Change active tools, model, and thinking level.
- Add status lines, widgets, headers, footers, overlays, custom editors, and autocomplete providers.
- Discover dynamic skills, prompts, and themes.
- Customize compaction and session-tree summaries.

### Common events

Startup/session:

- `session_start`
- `resources_discover`
- `session_shutdown`

Prompt/agent flow:

- `input`
- `before_agent_start`
- `agent_start`
- `turn_start`
- `context`
- `before_provider_request`
- `after_provider_response`
- `tool_call`
- `tool_result`
- `turn_end`
- `agent_end`

Session operations:

- `session_before_switch`
- `session_before_fork`
- `session_before_compact`
- `session_compact`
- `session_before_tree`
- `session_tree`

### Custom tools

Typical shape:

```ts
import { Type } from "typebox";

pi.registerTool({
  name: "deploy",
  label: "Deploy",
  description: "Deploy the app",
  parameters: Type.Object({}),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    onUpdate?.({ content: [{ type: "text", text: "Deploying..." }] });
    return {
      content: [{ type: "text", text: "Deployment complete" }],
      details: {},
    };
  },
});
```

Tool best practices:

- Validate all inputs.
- Make output concise and useful to the model.
- Return structured details when later renderers or branch reconstruction need them.
- Throw errors for failed calls.
- Respect `AbortSignal`.
- Use progress updates for long-running work.
- Truncate large output; a good default ceiling is about 50KB or 2000 lines.
- Make file mutations safe under parallel tool calls.
- Normalize paths and handle leading `@` when accepting file references.

### UI APIs

Simple UI:

- `ctx.ui.select()`
- `ctx.ui.confirm()`
- `ctx.ui.input()`
- `ctx.ui.editor()`
- `ctx.ui.notify()`

Persistent/custom UI can set:

- status lines
- widgets
- footer/header/title
- editor text or custom editor component
- working indicator
- autocomplete providers
- overlays
- theme

TUI component rules:

- Rendered lines must fit the terminal width.
- Use Pi/TUI width helpers instead of string length for ANSI/Unicode text.
- Reapply ANSI styles per line.
- Invalidate cached themed output when theme changes.
- Request re-render after state changes.
- Check `ctx.hasUI`; print/JSON lack UI, and RPC has protocol-backed dialogs but not every TUI feature.

## Packages

### Manifest

```json
{
  "name": "my-pi-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

If no `pi` manifest exists, Pi discovers conventional directories:

- `extensions/`
- `skills/`
- `prompts/`
- `themes/`

### Commands

```bash
pi install npm:@scope/package
pi install npm:@scope/package@1.2.3
pi install git:github.com/user/repo@v1
pi install ./local-package
pi install -l npm:@scope/package
pi remove npm:@scope/package
pi list
pi update
pi config
```

`pi config` opens an interactive UI; avoid it in headless validation.

Notes:

- `-l` installs project-locally into `.pi/settings.json`.
- Pinned npm versions and git refs are skipped by update.
- Local paths are live references, not copies.
- Project package entries win over duplicate global entries.

Dependency best practices:

- Runtime dependencies belong in `dependencies`.
- Pi core libraries should usually be `peerDependencies: "*"` and not bundled: `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`, `typebox`.
- If bundling another Pi package as part of your package, list it in both `dependencies` and `bundledDependencies`.

## Models and providers

### `models.json`

Use `~/.pi/agent/models.json` for providers that speak a supported API shape:

- `openai-completions`
- `openai-responses`
- `anthropic-messages`
- `google-generative-ai`

Example:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [{ "id": "qwen2.5-coder:7b" }]
    }
  }
}
```

Use extension custom providers when you need:

- custom streaming protocol
- OAuth/SSO
- token exchange
- dynamic model discovery
- provider-specific request/response behavior

Provider best practices:

- Prefer async extension factory for model discovery before startup completes.
- Handle aborts.
- Emit stream events in the expected order.
- Accumulate usage/cost where possible.
- Normalize context-window errors.

## SDK, RPC, and JSON mode

### SDK

Use for same-process Node/TypeScript apps.

Core APIs:

- `createAgentSession()`
- `createAgentSessionRuntime()`
- `DefaultResourceLoader`
- `AuthStorage`
- `ModelRegistry`
- `SettingsManager`
- `SessionManager`

Prefer SDK when you want type safety and direct state/resource control.

### RPC mode

Use for external processes or non-Node languages:

```bash
pi --mode rpc
```

RPC is strict LF-delimited JSONL over stdin/stdout. Use it for custom frontends, IDE integrations, or process-isolated controllers.

### JSON mode

Use for one-shot event streaming:

```bash
pi --mode json "prompt"
```

Use RPC instead if you need an ongoing command protocol.

## Common mistakes

- Choosing an extension when a skill or prompt template would be enough.
- Returning the wrong custom tool result shape.
- Bundling Pi core libraries instead of using peer dependencies.
- Forgetting to test with `pi -e ./extension.ts` or `/reload`.
- Mutating files from parallel tools without serialization.
- Assuming interactive TUI APIs work the same in print, JSON, or RPC mode.

## Headless validation recipe

Use checks that do not require LLM credentials or network where possible:

```bash
npm run check                  # e.g. tsc --noEmit
npm pack --dry-run --json      # verify package contents
PI_OFFLINE=1 pi --list-models -e ./package-or-extension
printf '{"type":"get_commands"}\n' | pi --mode rpc --no-session -e ./package-or-extension
pi -p --no-session -e ./package-or-extension "pkg-demo-ping"  # if an input/command hook handles it before LLM use
```

Prefer `pi list`, `pi --list-models`, RPC `get_commands`, and print-mode handled-command smoke tests for automation.

## Security checklist

- Review third-party packages and extensions before installing.
- Treat skills and prompts as security-sensitive because they steer the model.
- Audit `.pi/settings.json`; project-local settings may auto-install packages.
- Avoid literal secrets in shared config.
- Be careful with `models.json` or auth headers that execute shell commands.
- Confirm destructive tools in interactive mode.
- Block or require explicit opt-in for destructive tools in non-interactive mode.
- Protect sensitive paths: `.env`, `.ssh`, `.aws`, credentials, `.git`, and similar.
- Truncate output to avoid context overflow.
- Design tools to be safe when run in parallel.
