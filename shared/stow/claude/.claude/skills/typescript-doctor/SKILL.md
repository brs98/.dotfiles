---
name: typescript-doctor
description: Run after making TypeScript changes to catch issues early. Use when reviewing code, finishing a feature, or fixing bugs in a TypeScript project.
---

# TypeScript Doctor

Diagnose TypeScript codebase health — type safety, configuration, and best practices.

## When to Apply

- After making significant TypeScript changes
- Before committing or opening a PR
- When reviewing TypeScript configuration
- When starting a new TypeScript project

## How to Run

```bash
bun run /Users/brandon/personal/typescript-doctor/src/cli.ts [directory] [options]
```

### Options

- `--verbose` — Show file-level details with line numbers per rule
- `--diff [base]` — Only scan files changed vs base branch (default: main)
- `--score` — Output only numeric score (0-100)
- `--json` — Machine-readable JSON output
- `--fail-on <level>` — Exit non-zero on: `error`, `warning`, or `none`
- `--no-config` — Skip tsconfig.json checks
- `--no-ast` — Skip AST source file checks

## What It Checks

### AST Rules (12)
- Non-null assertions (`!`)
- Double assertions (`as unknown as T`)
- `let` that should be `const`
- `Object.freeze()` instead of `as const`
- Empty arrays without type annotation
- Intersection types instead of `interface extends`
- Duplicate interfaces (declaration merging)
- `const enum` usage
- `namespace` usage
- Empty object type `{}`
- `private` keyword instead of `#`
- Runtime code in `.d.ts` files

### Config Rules (11)
- `strict: true`
- `noUncheckedIndexedAccess`
- Module/moduleResolution pairing
- `isolatedModules` with bundlers
- `verbatimModuleSyntax`
- lib/target version sync
- `noEmit` with bundlers
- `skipLibCheck`
- `declaration` for libraries
- `references` for monorepos
- `noImplicitOverride`

## Scoring

Health score 0-100 based on penalties per unique rule violated:
- **75+** Great
- **50-74** Needs Work
- **<50** Critical

## Example Usage

```bash
# Quick health check
bun run /Users/brandon/personal/typescript-doctor/src/cli.ts .

# Detailed report
bun run /Users/brandon/personal/typescript-doctor/src/cli.ts . --verbose

# CI mode — fail on errors
bun run /Users/brandon/personal/typescript-doctor/src/cli.ts . --fail-on error

# Only check changed files
bun run /Users/brandon/personal/typescript-doctor/src/cli.ts . --diff main
```
