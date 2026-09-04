# Describe genuinely injected global values

**When:** A build tool or host supplies a runtime value that is not declared in source. Check spelling, imports and existing project declarations before assuming a missing identifier is injected.

The build/host must supply these values; this file only describes them:

```typescript
// file: globals.d.ts
declare const __VERSION__: string;
declare const __DEV__: boolean;
```

Runtime usage belongs in an implementation file:

```typescript
// file: application.ts
console.log(__VERSION__);
if (__DEV__) console.log("Development diagnostics enabled");
```

Include the declaration file in the consuming TypeScript project. A script-style `.d.ts` declares globals; adding imports or exports changes its scope, so use [declare global](modules-declare-global-for-global-types.md) from a module. `declare const` never initializes a value: execution without the promised injection can still throw ReferenceError.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [Workshop injected globals](https://www.totaltypescript.com/workshops/typescript-pro-essentials/modules-scripts-and-declaration-files/type-variables-declared-elsewhere/solution)

For unchecked external values, apply the canonical [unknown boundary and validation guidance](narrowing-unknown-boundaries.md); an ambient declaration only describes an assumed runtime value.
