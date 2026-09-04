# Check compatibility with single-file transpilation

**When:** Babel, esbuild, SWC, or another tool transpiles files without TypeScript's full type information.

```json
{
  "compilerOptions": {
    "isolatedModules": true
  }
}
```

This enables diagnostics for constructs whose emit needs cross-file type knowledge; it does not transform unsupported source or guarantee every transpiler supports every remaining feature. `verbatimModuleSyntax` also enables these isolated-module checks in modern TypeScript, so do not require both flags solely for that purpose.

An ambient const enum has no runtime object. Consuming it is rejected with isolated-module checking:

```typescript
export {};
declare const enum Numbers { Zero, One }
// @ts-expect-error Ambient const enum access is disallowed with isolatedModules.
const example = Numbers.Zero;
```

Use a runtime object when that fits the API:

```typescript
export const Numbers = { Zero: 0, One: 1 } as const;
export const example = Numbers.Zero;
```

Local const enums can be supported by single-file transpilers; removing `declare` changes the runtime/emit contract rather than merely silencing a check. See [const enum boundaries](ts-only-avoid-const-enums.md).

**Validation:** Examples checked with TypeScript 5.9.2, strict and isolatedModules enabled.

**Source:** [TypeScript isolatedModules](https://www.typescriptlang.org/tsconfig/isolatedModules.html)
