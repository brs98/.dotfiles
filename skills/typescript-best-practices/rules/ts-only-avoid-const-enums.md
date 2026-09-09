# Understand const-enum portability boundaries

**When:** Choosing an enum representation for different transpilers or a published API.

A JavaScript object with a const assertion is one portable option:

```typescript
const Direction = { Up: "UP", Down: "DOWN" } as const;
type Direction = (typeof Direction)[keyof typeof Direction];
const move: Direction = Direction.Up;
```

Local const enums are not inherently incompatible with single-file transpilers: esbuild supports them, and TypeScript can compile local const enums with `isolatedModules`. Check the actual tool and emit settings rather than claiming they require tsc.

The important risks are **ambient** const-enum consumption under isolated compilation, publishing declarations whose values consumers inline, and consumers running a different dependency version from the one used for compilation. A `declare const enum` promises values without creating a runtime object. A regular enum also needs runtime emit and is not accepted by an erasable-only runtime; a declared enum requires an actual runtime provider.

Use the object form when its value/type behavior fits the API; replacing an existing enum can change assignability or public API behavior. `as const` is compile-time readonly and does not freeze the runtime object.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript const enum pitfalls](https://www.typescriptlang.org/docs/handbook/enums.html#const-enum-pitfalls), [esbuild supported TypeScript syntax](https://esbuild.github.io/content-types/#typescript)
