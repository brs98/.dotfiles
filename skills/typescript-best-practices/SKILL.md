---
name: typescript-best-practices
description: Use when writing, reviewing, or refactoring TypeScript code - applies Total TypeScript Pro Essentials patterns for type safety, narrowing, generics, and idiomatic TypeScript
---

# TypeScript Best Practices

Comprehensive TypeScript best practices.
Contains 108 rules across 11 categories.

## When to Apply

- Writing new TypeScript code
- Reviewing existing TypeScript for improvements
- Refactoring JavaScript to TypeScript
- Debugging type errors
- Configuring tsconfig.json

## Rule Categories by Priority

| Priority | Category           | Rules | Prefix        |
| -------- | ------------------ | ----- | ------------- |
| CRITICAL | Narrowing Patterns | 13    | `narrowing-`  |
| CRITICAL | Type Safety        | 12    | `safety-`     |
| HIGH     | Generics & Design  | 12    | `generics-`   |
| HIGH     | Objects            | 9     | `objects-`    |
| MEDIUM   | Deriving Types     | 9     | `deriving-`   |
| MEDIUM   | Configuration      | 10    | `config-`     |
| MEDIUM   | Modules            | 10    | `modules-`    |
| LOW      | Essentials         | 8     | `essentials-` |
| LOW      | Classes            | 7     | `classes-`    |
| LOW      | Tooling            | 10    | `tooling-`    |
| LOW      | TS-Only Features   | 8     | `ts-only-`    |

## Quick Reference

### Narrowing (CRITICAL - 13 rules)

- `narrowing-discriminated-unions` - Use `type` or `kind` field for union discrimination
- `narrowing-discriminated-tuples` - Use literal first element to discriminate tuple unions
- `narrowing-type-predicates` - Create reusable type guards with `is` return type
- `narrowing-in-operator` - Use `in` to narrow by property existence
- `narrowing-instanceof` - Use instanceof for class/constructor narrowing
- `narrowing-typeof` - Use typeof for primitive narrowing
- `narrowing-switch-statements` - Use switch for exhaustive union handling
- `narrowing-truthiness` - Narrow nullish values with truthiness checks
- `narrowing-throw-to-narrow` - Use throw to narrow in else branches
- `narrowing-never-return-type` - Use never return type for exhaustive checks
- `narrowing-callback-scope` - Extract to const before callbacks to preserve narrowing
- `narrowing-no-destructure-discriminated-union` - Don't destructure before narrowing
- `narrowing-empty-array-type` - Annotate empty arrays to avoid never[] inference

### Type Safety (CRITICAL - 12 rules)

- `safety-satisfies-over-type-annotation` - Use `satisfies` to validate without widening
- `safety-as-const-deep-readonly` - Use `as const` for deep immutability
- `safety-satisfies-with-as-const` - Combine for validation + immutability
- `safety-avoid-over-annotation` - Let TypeScript infer when possible
- `safety-non-null-assertion-sparingly` - Avoid non-null assertions (the ! operator), narrow instead
- `safety-avoid-double-assertion` - Never use `as unknown as T`
- `safety-readonly-array-parameters` - Use `readonly T[]` for non-mutating functions
- `safety-readonly-type-helper` - Use `Readonly<T>` for immutable objects
- `safety-readonly-tuples` - Add readonly to tuple types
- `safety-const-over-let-inference` - Use const for literal type inference
- `safety-as-const-over-object-freeze` - Prefer as const over Object.freeze
- `safety-as-const-on-return-tuples` - Use as const on tuple returns

### Generics & Design (HIGH - 12 rules)

- `generics-constrain-type-parameters` - Use extends for required properties
- `generics-default-type-parameters` - Set defaults for common cases
- `generics-strict-omit` - Create StrictOmit for typo protection
- `generics-mapped-types-derive-shapes` - Use `[K in keyof T]` to transform types
- `generics-remap-keys-with-as` - Use as clause to rename keys
- `generics-template-literal-combinations` - Generate string combinations automatically
- `generics-template-literal-patterns` - Enforce string patterns at type level
- `generics-function-type-inference` - Let type parameters be inferred
- `generics-function-default-type` - Default type for when inference fails
- `generics-function-constraints` - Use `K extends keyof T` for safe property access
- `generics-type-predicates` - Use `value is Type` for type guards
- `generics-assertion-functions` - Use `asserts param is Type` for validators

### Objects (HIGH - 9 rules)

- `objects-interface-extends-over-intersections` - Use extends for performance
- `objects-interface-extends-catches-conflicts` - Extends surfaces conflicts
- `objects-avoid-duplicate-interfaces` - Prevent accidental declaration merging
- `objects-index-signature-with-known-keys` - Combine explicit + index signature
- `objects-record-with-union-keys` - Use Record to enforce all union keys
- `objects-propertykey-for-any-key-type` - Use PropertyKey for generic keys
- `objects-distributive-omit-for-unions` - Distribute Omit over union members
- `objects-omit-allows-nonexistent-keys` - Create StrictOmit for safety
- `objects-union-for-shared-properties` - Unions only allow shared properties

### Deriving Types (MEDIUM - 9 rules)

- `deriving-typeof-for-object-keys` - Use `keyof typeof` for key unions
- `deriving-returntype-for-function-returns` - Use ReturnType to extract returns
- `deriving-awaited-for-async-returns` - Compose Awaited + ReturnType for async
- `deriving-parameters-for-function-args` - Use Parameters for arg types
- `deriving-indexed-access-for-object-values` - Use `Type["key"]` for value types
- `deriving-keyof-for-all-values` - Use `Type[keyof Type]` for value unions
- `deriving-union-from-array` - Use `(typeof arr)[number]` for element unions
- `deriving-union-indexed-access` - Pass union of keys for value subsets
- `deriving-same-name-type-and-value` - Export same name as type and value

### Configuration (MEDIUM - 10 rules)

- `config-strict-mode` - Always use `strict: true`
- `config-no-unchecked-indexed-access` - Enable for safe array/object access
- `config-module-resolution` - Match module and moduleResolution settings
- `config-isolated-modules` - Enable when using esbuild/swc/Babel
- `config-verbatim-module-syntax` - Force explicit import type
- `config-lib-target-sync` - Keep lib and target in sync
- `config-no-emit-linter` - Use noEmit when bundler transpiles
- `config-skip-lib-check` - Skip checking declaration files
- `config-declaration-files` - Enable for library output
- `config-project-references` - Use for monorepos

### Modules & Declarations (MEDIUM - 10 rules)

- `modules-dts-no-runtime-code` - Declaration files can't have implementations
- `modules-dts-module-vs-script` - Use `export {}` to control scope
- `modules-declare-const-for-external-globals` - Type injected globals
- `modules-declare-global-for-global-types` - Add to global from modules
- `modules-declare-module-for-missing-types` - Create ambient declarations
- `modules-declare-module-wildcard-for-assets` - Type asset imports
- `modules-dts-for-javascript-not-types` - Use .ts for your own types
- `modules-types-packages-for-untyped-libs` - Install @types packages
- `modules-augment-global-interfaces` - Extend Window, process.env, etc.
- `modules-dts-files-for-javascript` - Create .d.ts for existing .js

### Essentials (LOW - 8 rules)

- `essentials-type-alias-for-reuse` - Extract repeated type shapes
- `essentials-optional-parameters` - Use `?` for optional params/properties
- `essentials-array-type-syntax` - Use `Type[]` or `Array<Type>`
- `essentials-tuple-types` - Use `[T1, T2]` for fixed-length arrays
- `essentials-function-type-annotations` - Type callbacks with arrow syntax
- `essentials-generic-collections` - Pass type args to Set, Map, etc.
- `essentials-rest-parameters` - Annotate rest params as arrays
- `essentials-typing-json-parse` - Use assertions for JSON.parse

### Classes (LOW - 7 rules)

- `classes-private-fields-javascript` - Use `#` for true runtime privacy
- `classes-implements-interface` - Use implements to enforce contracts
- `classes-extends-inheritance` - Use extends to share functionality
- `classes-override-keyword` - Enable noImplicitOverride, use override
- `classes-getters-setters` - Use get/set for computed properties
- `classes-this-annotation` - Type `this` parameter for context-dependent functions
- `classes-property-initialization` - Initialize properties directly

### Tooling (LOW - 10 rules)

- `tooling-tsc-watch-mode` - Use `tsc --watch` for development
- `tooling-outdir-for-compiled-files` - Separate output in dist/
- `tooling-typescript-as-linter` - Use noEmit with bundlers
- `tooling-dont-block-dev-server` - Run type checking separately
- `tooling-ci-type-checking` - Always run tsc in CI
- `tooling-tsx-for-scripts` - Use tsx for instant script execution
- `tooling-restart-ts-server` - Restart TS Server when stuck
- `tooling-rename-symbol` - Use F2 for semantic renames
- `tooling-go-to-definition` - Use Cmd+Click to navigate
- `tooling-quick-fix-extract` - Use Cmd+. for refactoring

### TypeScript-Only Features (LOW - 8 rules)

- `ts-only-avoid-const-enums` - Use as const objects instead
- `ts-only-avoid-namespaces` - Use ES modules instead
- `ts-only-parameter-properties` - Use private/public in constructor
- `ts-only-empty-object-type` - `{}` means non-nullish, not empty
- `ts-only-object-keys-typing` - Object.keys returns string[]
- `ts-only-excess-property-checks` - Only on literal objects
- `ts-only-union-of-functions` - Parameters intersect, returns union
- `ts-only-catch-block-typing` - Use instanceof in catch blocks

## How to Use

Read individual rule files in `rules/` for code examples with Bad/Good patterns.

Each rule includes:

- **When:** Trigger condition
- **Bad:** Code showing the problem
- **Good:** Code showing the solution
- **Why:** Brief explanation
