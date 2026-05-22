---
name: pi-extension-authoring
description: Guides agents through choosing, designing, implementing, and packaging Pi coding agent extension points. Use when the user asks how to extend or customize Pi, write Pi extensions, skills, prompt templates, themes, packages, custom providers/models, SDK/RPC integrations, or Pi-specific tooling.
---

# Pi Extension Authoring

## Quick start

1. **Clarify the customization goal**: new model behavior, reusable workflow, slash command, tool, UI, provider, theme, package, or app integration.
2. **Choose the smallest extension surface**:
   - Stable instructions/conventions → `AGENTS.md` or `APPEND_SYSTEM.md`
   - Reusable prompt text → prompt template
   - Reusable agent workflow → skill
   - New deterministic capability, event behavior, safety gate, or UI → TypeScript extension
   - Visual styling → theme
   - API-compatible model/provider → `models.json`
   - Custom auth/streaming/model discovery → provider extension
   - Distribution → Pi package
   - Programmatic Node integration → SDK
   - Non-Node/custom frontend integration → RPC mode
3. **Read the current Pi docs before implementing**. Prefer installed docs for the running Pi version: `README.md`, `docs/extensions.md`, `docs/skills.md`, `docs/prompt-templates.md`, `docs/themes.md`, `docs/packages.md`, `docs/models.md`, `docs/custom-provider.md`, `docs/sdk.md`, `docs/rpc.md`, `docs/tui.md`.
4. **Inspect examples** under the installed Pi package, especially `examples/extensions/` and `examples/sdk/`.
5. **Implement, test with `/reload` or explicit CLI flags, and run a security review**.

See [REFERENCE.md](REFERENCE.md) for API details, patterns, and best practices.

## Workflow: choose the right surface

Ask:

- Does this only tell the agent how to behave in this repo? Use `AGENTS.md`.
- Is it a short reusable prompt invoked by `/name`? Use a prompt template.
- Is it a reusable procedure with decision points? Use a skill.
- Does it need code execution, custom tools, events, UI, or provider integration? Use an extension.
- Should others install it as a bundle? Package it.
- Is this for an external app? Use SDK for TypeScript/Node, RPC for other languages.

Prefer the least powerful mechanism that solves the problem.

## Workflow: author a TypeScript extension

Checklist:

- Put files in `.pi/extensions/`, `~/.pi/agent/extensions/`, or a Pi package.
- Export `default function(pi)` or `async function(pi)`.
- Register tools/commands/shortcuts/providers during extension load by default; register dynamically only when intentional and supported.
- Use event hooks for cross-cutting behavior.
- Check `ctx.hasUI`; print/JSON lack UI, and RPC supports only part of the TUI surface.
- Validate arguments and paths.
- Respect `AbortSignal`.
- Truncate large outputs.
- Guard destructive actions with confirmations or explicit config.
- Test with `pi -e ./extension.ts` before auto-loading.

## Workflow: package customizations

Checklist:

- Add `package.json` with `keywords: ["pi-package"]`.
- Add a `pi` manifest for `extensions`, `skills`, `prompts`, and/or `themes`.
- Put runtime dependencies in `dependencies`.
- Keep Pi core libraries as peer dependencies, not bundled dependencies.
- Pin package versions or git refs for team reproducibility.
- Document install, update, and security implications.

## Security review

Before sharing or enabling third-party resources:

- Treat extensions and packages as arbitrary code with full user permissions.
- Treat skills/prompts as capable of steering the model into dangerous actions.
- Audit project `.pi/settings.json`; it can auto-install packages.
- Avoid literal secrets in config.
- Protect sensitive paths such as `.env`, `.ssh`, `.aws`, credentials, and `.git`.
- Block dangerous operations in non-interactive modes unless explicitly allowed.
