# isolated-modules

**When:** Using any bundler or transpiler other than tsc (esbuild, swc, Babel).

## Bad
```typescript
// tsconfig.json: isolatedModules not set
declare const enum Numbers {
  Zero,
  One,
}
const example = Numbers.Zero; // Runtime error when compiled by esbuild/swc
```

## Good
```typescript
// tsconfig.json: "isolatedModules": true
const enum Numbers {
  Zero,
  One,
}
const example = Numbers.Zero; // Works correctly
```

## Why
`isolatedModules` disables TypeScript features that require whole-program knowledge, making your code compatible with single-file transpilers like esbuild and swc which are faster than tsc.

## Note
If `verbatimModuleSyntax: true` is already enabled (TS 5.0+), `isolatedModules` is redundant — `verbatimModuleSyntax` is a strict superset that enforces everything `isolatedModules` does plus requires import/export syntax to match the module output format.
