---
name: typescript-best-practices
description: Write, review, and refactor TypeScript with version-aware Total TypeScript patterns for narrowing, generics, contracts, and compiler configuration. Distinguish safety requirements from optional design choices.
---

# TypeScript best practices

Apply the relevant guidance to the project's TypeScript version, compiler options, runtime, and intended contracts. Read the matching rule before making a recommendation; this catalog is a reference, not a checklist of mandatory refactors.

## Review approach

- Identify the host and emit pipeline before changing compiler settings. Inspect the effective configuration and run the project's compiler with its existing package manager.
- Preserve runtime behavior, public argument/return contracts, mutation intent, and domain ownership. Structural similarity alone does not justify abstraction or derivation.
- Prefer flow-narrowed types and compiler evidence over syntax heuristics. Modern TypeScript supports correlated destructuring, preserved closure narrowing, and inferred predicates under specific conditions.
- Treat unchecked external data as unknown and validate it. Assertions express trusted contracts; `satisfies` is not runtime validation and does not turn any into a checked type.
- Distinguish static readonly guarantees from freezing. Keep runtime protection when it is required.
- Explain whether a finding is a compiler/type-safety issue, a trusted-invariant review, or optional design/style advice. Do not rewrite valid code merely to match an example.

## Sources and versions

Reviewed against Total TypeScript Pro Essentials and its [workshop source](https://github.com/total-typescript/pro-essentials-workshop/tree/7491e6c5ed45dfcb3593289397e3a68244898128), with current compiler behavior checked using TypeScript 5.9. Each substantive rule links its sources and states relevant assumptions. Specific features require newer minimum versions even where older workshop examples are valid. Verify newer compiler/runtime behavior when it matters.

The examples are isolated unless file markers explicitly form a multi-file example. Intentional negative examples use `@ts-expect-error`; configuration/tooling snippets depend on their stated host. A compiling example alone is not proof of semantic equivalence.

## Rule catalog

113 reference files across 11 categories. Compatibility entries link to canonical guidance rather than duplicating it.

### Narrowing (16)

- [Capture the value that was narrowed](rules/narrowing-callback-scope.md)
- [Relate tuple slots with a discriminant](rules/narrowing-discriminated-tuples.md)
- [Model distinct object states with literal tags](rules/narrowing-discriminated-unions.md)
- [Contextualize empty arrays when never[] blocks intended writes](rules/narrowing-empty-array-type.md)
- [Enforced exhaustiveness](rules/narrowing-exhaustiveness.md)
- [Narrow by presence, then validate the value when necessary](rules/narrowing-in-operator.md)
- [Validate caught values before reading Error properties](rules/narrowing-instanceof.md)
- [Map presence and values](rules/narrowing-map-get.md)
- [Describe synchronous non-returning helpers with never](rules/narrowing-never-return-type.md)
- [Preserve discriminant relationships when destructuring](rules/narrowing-no-destructure-discriminated-union.md)
- [Make union case handling exhaustive when required](rules/narrowing-switch-statements.md)
- [Guard nullable values before dereferencing](rules/narrowing-throw-to-narrow.md)
- [Choose truthiness or nullish checks according to valid values](rules/narrowing-truthiness.md)
- [Reuse truthful guards; prefer inferred predicates when available](rules/narrowing-type-predicates.md)
- [Narrow primitive unions at type-specific operations](rules/narrowing-typeof.md)
- [Unknown at unchecked boundaries](rules/narrowing-unknown-boundaries.md)

### Type safety (12)

- [Readonly literal expressions with as const](rules/safety-as-const-deep-readonly.md)
- [Preserve intended tuple returns](rules/safety-as-const-on-return-tuples.md)
- [Choose static readonly or runtime freezing](rules/safety-as-const-over-object-freeze.md)
- [Avoid assertions as a substitute for conversion](rules/safety-avoid-double-assertion.md)
- [Infer obvious locals; annotate intended contracts](rules/safety-avoid-over-annotation.md)
- [Prefer const for unchanged bindings](rules/safety-const-over-let-inference.md)
- [Verify the invariant behind non-null assertions](rules/safety-non-null-assertion-sparingly.md)
- [Express non-mutating array inputs](rules/safety-readonly-array-parameters.md)
- [Make tuple mutability intentional](rules/safety-readonly-tuples.md)
- [Use Readonly<T> for shallow read-only contracts](rules/safety-readonly-type-helper.md)
- [Choose satisfies when the initializer's shape is the contract](rules/safety-satisfies-over-type-annotation.md)
- [Combine readonly literal inference with compatibility checking](rules/safety-satisfies-with-as-const.md)

### Generics (12)

- [assertion-functions](rules/generics-assertion-functions.md)
- [constrain-type-parameters](rules/generics-constrain-type-parameters.md)
- [default-type-parameters](rules/generics-default-type-parameters.md)
- [function-constraints](rules/generics-function-constraints.md)
- [function-default-type](rules/generics-function-default-type.md)
- [function-type-inference](rules/generics-function-type-inference.md)
- [mapped-types-derive-shapes](rules/generics-mapped-types-derive-shapes.md)
- [remap-keys-with-as](rules/generics-remap-keys-with-as.md)
- [strict-omit](rules/generics-strict-omit.md)
- [template-literal-combinations](rules/generics-template-literal-combinations.md)
- [template-literal-patterns](rules/generics-template-literal-patterns.md)
- [type-predicates](rules/generics-type-predicates.md)

### Objects (9)

- [avoid-duplicate-interfaces](rules/objects-avoid-duplicate-interfaces.md)
- [distributive-omit-for-unions](rules/objects-distributive-omit-for-unions.md)
- [index-signature-with-known-keys](rules/objects-index-signature-with-known-keys.md)
- [interface-extends-catches-conflicts](rules/objects-interface-extends-catches-conflicts.md)
- [interface-extends-over-intersections](rules/objects-interface-extends-over-intersections.md)
- [omit-allows-nonexistent-keys](rules/objects-omit-allows-nonexistent-keys.md)
- [propertykey-for-any-key-type](rules/objects-propertykey-for-any-key-type.md)
- [record-with-union-keys](rules/objects-record-with-union-keys.md)
- [union-for-shared-properties](rules/objects-union-for-shared-properties.md)

### Deriving types (10)

- [awaited-for-async-returns](rules/deriving-awaited-for-async-returns.md)
- [Derive or keep independent contracts](rules/deriving-contract-ownership.md)
- [indexed-access-for-object-values](rules/deriving-indexed-access-for-object-values.md)
- [keyof-for-all-values](rules/deriving-keyof-for-all-values.md)
- [parameters-for-function-args](rules/deriving-parameters-for-function-args.md)
- [returntype-for-function-returns](rules/deriving-returntype-for-function-returns.md)
- [same-name-type-and-value](rules/deriving-same-name-type-and-value.md)
- [typeof-for-object-keys](rules/deriving-typeof-for-object-keys.md)
- [union-from-array](rules/deriving-union-from-array.md)
- [union-indexed-access](rules/deriving-union-indexed-access.md)

### Configuration (10)

- [Produce and publish library declarations deliberately](rules/config-declaration-files.md)
- [Check compatibility with single-file transpilation](rules/config-isolated-modules.md)
- [Configure syntax output and available APIs separately](rules/config-lib-target-sync.md)
- [Match module resolution to the execution environment](rules/config-module-resolution.md)
- [Use noEmit for a typecheck-only invocation](rules/config-no-emit-linter.md)
- [Account for unchecked indexed values](rules/config-no-unchecked-indexed-access.md)
- [Use project references for an intended build graph](rules/config-project-references.md)
- [Choose the declaration-checking tradeoff](rules/config-skip-lib-check.md)
- [Strict checking as a baseline](rules/config-strict-mode.md)
- [Make import erasure explicit](rules/config-verbatim-module-syntax.md)

### Modules and declarations (10)

- [Augment only the globals the runtime actually provides](rules/modules-augment-global-interfaces.md)
- [Describe genuinely injected global values](rules/modules-declare-const-for-external-globals.md)
- [Add globals from a module explicitly](rules/modules-declare-global-for-global-types.md)
- [Supply accurate declarations for an untyped module](rules/modules-declare-module-for-missing-types.md)
- [Match asset declarations to the loader's runtime values](rules/modules-declare-module-wildcard-for-assets.md)
- [Describe JavaScript that cannot be changed](rules/modules-dts-files-for-javascript.md)
- [Prefer regular modules for authored application types](rules/modules-dts-for-javascript-not-types.md)
- [Choose declaration-file scope deliberately](rules/modules-dts-module-vs-script.md)
- [Declaration files describe runtime values without implementing them](rules/modules-dts-no-runtime-code.md)
- [Find usable package types before writing replacements](rules/modules-types-packages-for-untyped-libs.md)

### Essentials (8)

- [Array type syntax](rules/essentials-array-type-syntax.md)
- [Function contracts](rules/essentials-function-type-annotations.md)
- [Generic collections](rules/essentials-generic-collections.md)
- [Optional parameters and properties](rules/essentials-optional-parameters.md)
- [Rest parameter contracts](rules/essentials-rest-parameters.md)
- [Tuple contracts](rules/essentials-tuple-types.md)
- [Shared type aliases](rules/essentials-type-alias-for-reuse.md)
- [Validate parsed data](rules/essentials-typing-json-parse.md)

### Classes (7)

- [Intentional inheritance](rules/classes-extends-inheritance.md)
- [Accessors and methods](rules/classes-getters-setters.md)
- [Explicit class contracts](rules/classes-implements-interface.md)
- [Checked overrides](rules/classes-override-keyword.md)
- [Runtime private fields](rules/classes-private-fields-javascript.md)
- [Class initialization](rules/classes-property-initialization.md)
- [Dynamic and bound receivers](rules/classes-this-annotation.md)

### Tooling (11)

- [Require a real project typecheck in CI](rules/tooling-ci-type-checking.md)
- [Keep development feedback responsive](rules/tooling-dont-block-dev-server.md)
- [Scoped compiler suppressions](rules/tooling-error-suppressions.md)
- [Navigate by symbol identity](rules/tooling-go-to-definition.md)
- [Separate compiler output when the project wants an output directory](rules/tooling-outdir-for-compiled-files.md)
- [Use semantic extraction as a refactoring aid](rules/tooling-quick-fix-extract.md)
- [Rename symbols with semantic tooling](rules/tooling-rename-symbol.md)
- [Restart stale language-service state after checking the project context](rules/tooling-restart-ts-server.md)
- [Run the appropriate checker in watch mode](rules/tooling-tsc-watch-mode.md)
- [Choose an appropriate TypeScript script runner](rules/tooling-tsx-for-scripts.md)
- [Compatibility link: TypeScript as a type checker](rules/tooling-typescript-as-linter.md)

### TypeScript-only features (8)

- [Understand const-enum portability boundaries](rules/ts-only-avoid-const-enums.md)
- [Prefer ES modules for new application module boundaries](rules/ts-only-avoid-namespaces.md)
- [Narrow the actual caught value before using it](rules/ts-only-catch-block-typing.md)
- [Distinguish non-nullish values from an empty shape](rules/ts-only-empty-object-type.md)
- [Use fresh-literal checking without assuming exact types](rules/ts-only-excess-property-checks.md)
- [Preserve the distinction between runtime keys and static keys](rules/ts-only-object-keys-typing.md)
- [Use parameter properties only when their emit is supported](rules/ts-only-parameter-properties.md)
- [Call function unions with arguments accepted by every possible member](rules/ts-only-union-of-functions.md)

## Maintaining this reference

After changing rules, regenerate the index with `python3 scripts/update-index.py` and check references with `python3 scripts/check-index.py`. Validate isolated TypeScript examples using an already installed compiler:

```sh
node scripts/check-examples.cjs /path/to/typescript/lib/typescript.js
```

Use focused compiler/runtime checks for configuration-sensitive and behavior-changing examples as well. Never download dependencies just to run this reference's checks without applying the project's normal package-management workflow.
