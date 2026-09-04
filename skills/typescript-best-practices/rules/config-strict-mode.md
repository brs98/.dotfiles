# Strict checking as a baseline

**When:** Choosing a checking baseline for new TypeScript code or tightening an existing project.

Prefer the strict family rather than accidentally enabling only some of its checks:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

`strict` enables a family of checks that can grow with TypeScript versions. Individual flags set to `false` still override it; review those exceptions during upgrades. `noUncheckedIndexedAccess` and `noImplicitOverride` are separate choices, not included in strict.

Adopt stricter checking deliberately in an existing codebase. This config improves static checking; it does not validate runtime inputs or eliminate escape hatches such as `any` and assertions.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript strict](https://www.typescriptlang.org/tsconfig/strict.html)

Modern options supplement these workshop defaults: choose `exactOptionalPropertyTypes` when absence differs from explicitly stored undefined, and `erasableSyntaxOnly` (TypeScript 5.8+) for a pipeline that only strips types. Neither is included in strict and neither should be enabled without checking the intended contracts and execution host. See [optional-property semantics](essentials-optional-parameters.md) and [transforming parameter properties](ts-only-parameter-properties.md).
