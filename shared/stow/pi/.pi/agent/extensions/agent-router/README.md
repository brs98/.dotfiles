# Agent Router Extension

Global Pi extension for routing repo tasks to specialized agent harnesses. Repo-specific agents and protected paths live in each repo's `.pi/agent-router.config.ts`.

## What it does

- Registers the model-callable `route_agent_task` and `safe_bash` tools only when the current repo has `.pi/agent-router.config.ts`.
- Registers the `/route-agent` slash command.
- Loads repo-specific routing config from `.pi/agent-router.config.ts`.
- Routes edit/read paths to specialized repo agents.
- Records an active route whenever `route_agent_task` runs or `/route-agent` routes paths.
- In configured repos, blocks `write`/`edit` until an active route exists.
- In configured repos, blocks `write`/`edit` outside the active route's allowed edit paths.
- Generates delegation prompts with allowed edit paths, read-only context, skills, validations, and report format.
- Emits copy/paste-ready `subagent` tool invocation data for each routed agent, compatible with `~/.pi/agent/extensions/subagent.ts`.
- In configured repos, auto-delegates by spawning child `pi --mode json --no-session -p ...` processes for routed work.
- Gives delegated children `safe_bash` for read-only exploration and validation without raw shell writes.
- Always blocks built-in protected paths such as `.git/**` and `node_modules/**`, plus repo-configured protected paths.

## Repository config

Define repo-specific agents and protected paths in `.pi/agent-router.config.ts`. The config is a plain object so it does not depend on where the global extension is installed:

```ts
export default {
  agents: [
    {
      id: "billing",
      label: "Billing agent",
      description: "Handles billing workflows and packages.",
      priority: 80,
      owns: ["packages/billing/**"],
      mayEdit: ["packages/billing/**"],
      readOnly: ["packages/payments/**"],
      requiredSkills: ["typescript-best-practices"],
      validations: ["pnpm --filter @acme/billing check"],
      instructions: ["Keep billing core free of generated API clients."],
    },
  ],
  protectedPathPolicies: [
    {
      label: "generated clients",
      patterns: ["packages/api-clients/**"],
      reason: "Generated; run codegen instead of hand-editing.",
    },
  ],
};
```

If no repo config exists, Agent Router stays quiet for model turns: it does not register `route_agent_task` or `safe_bash`, and it does not append Agent Router guidance to the system prompt. The `/route-agent` command still has **soft fallback mode** for manual diagnostics; it falls back to a permissive `repo-coordinator` agent, with route enforcement and auto-delegation disabled. Normal `write`/`edit` behavior is not route-gated in unconfigured repos. Built-in protections still block `.git/**` and `node_modules/**`.

## Tool input shape

```json
{
  "title": "Fix admin refund bug",
  "intent": "bugfix",
  "editPaths": ["apps/fluid-admin/pages/orders/[id].tsx", "packages/orders/core/src/refunds.ts"],
  "readPaths": [],
  "acceptanceCriteria": ["Refund behavior is correct", "Scoped checks pass"],
  "delegateMode": "primary"
}
```

## Subagent handoff and auto-delegation

Each `RoutedAgentWork` includes a `subagentInvocation` object and the tool output renders the same data as JSON. You can still copy/paste it into the user-level `subagent` tool from `~/.pi/agent/extensions/subagent.ts`.

For a pragmatic v1, `route_agent_task` also spawns child Pi processes directly in configured repos. Auto-delegation is default-on for parent sessions when `.pi/agent-router.config.ts` exists, and caller-provided `delegate: false` is ignored in that configured mode. When no repo config exists, `route_agent_task` is not registered for model use and `/route-agent` soft fallback disables auto-delegation. Delegated child processes suppress recursive delegation via `PI_AGENT_ROUTER_DELEGATE_DEPTH`.

Optional delegation fields:

- `delegateMode` — `"primary"` or `"all"`, default `"primary"`.
- `delegateTimeoutMs` — per-child timeout, default 10 minutes.
- `delegateModel` — optional Pi model pattern/id passed through as `--model`.

Auto-delegation shells out to the current Pi entrypoint when possible, otherwise to `pi`, using `--mode json --no-session -p`. Extensions cannot rely on directly invoking another registered tool, so this intentionally mirrors the user-level subagent process-spawn strategy without worktrees.

Example invocation shape:

```json
{
  "toolName": "subagent",
  "arguments": {
    "task": "<delegation prompt>",
    "role": "fluid-admin primary: Fluid Admin Next.js Pages Router specialist...",
    "cwd": ".",
    "tools": ["read", "safe_bash", "write", "edit", "route_agent_task"]
  }
}
```

The routed task text contains the full delegation prompt. The `role` field identifies the specialized harness, and `tools` includes `route_agent_task` so the child Pi process can establish its own active edit route before using `write` or `edit`. Delegated child processes do not receive raw `bash` by default because shell writes can bypass Agent Router enforcement; they receive `safe_bash` instead.

## Safe command access

Delegated children can use `safe_bash` for constrained, read-only repository commands. It accepts a command plus argv array and runs with `shell: false`.

Allowed command families include:

- `rg`, `ls`, and non-mutating `find`
- read-only `git` subcommands such as `status`, `diff`, `log`, `show`, `grep`, and `ls-files`
- safe validation commands such as `pnpm check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm exec oxlint`, and `pnpm exec oxfmt --check`

Blocked examples include raw shell syntax, path traversal, absolute paths, `find -delete`, mutating git subcommands, `--fix`, `--write`, `--watch`, and `pnpm exec oxfmt` without `--check`.

Example:

```json
{
  "command": "pnpm",
  "args": ["exec", "oxfmt", "--check", ".pi/extensions/agent-router"],
  "timeoutMs": 60000
}
```

## Slash command examples

```text
/route-agent --title "Fix admin refund" --intent bugfix --edit apps/fluid-admin/pages/orders/[id].tsx,packages/orders/core/src/refunds.ts
```

```text
/route-agent --title "Fix admin refund" --intent bugfix --edit apps/fluid-admin/pages/orders/[id].tsx --delegate-mode primary
```

```text
/route-agent --title "Create status pill" --intent feature --edit packages/platform/ui-components/src/components/StatusPill.tsx --read packages/platform/ui-primitives/src/components/badge.tsx
```

```text
/route-agent status
/route-agent clear
```

## Enforcement model

In repos with `.pi/agent-router.config.ts`, `write` and `edit` calls are allowed only when the target path is covered by the active route's allowed edit paths. If the model needs to edit a new path, it must call `route_agent_task` again with revised `editPaths`/`readPaths` before editing.

In repos without `.pi/agent-router.config.ts`, Agent Router is advisory: it does not route-gate normal `write`/`edit` calls and does not auto-delegate. Built-in protected paths remain blocked.

## Current scope

This is v1 routing, configured-repo enforcement, repo-config loading, and configured-repo direct Pi child-process delegation. Auto-delegation does not create worktrees; `delegateMode: "all"` runs sequentially in the same checkout to avoid unsafe parallel edits.
