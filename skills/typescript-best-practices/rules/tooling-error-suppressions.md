# Scoped compiler suppressions

**When:** An intentional error example or a documented external limitation cannot currently be expressed correctly.

Use `@ts-expect-error` for an intentional negative test: it fails when the next line stops producing an error.

```typescript
function square(value: number) { return value * value; }
// @ts-expect-error Regression: strings must remain rejected.
square("2");
```

Fix the underlying type when feasible. A necessary suppression should be local and explain the actual limitation or invariant. `@ts-ignore` hides errors even when the original reason disappears; reserve it for a justified compatibility case, such as a supported compiler-version range where a line may or may not error. Avoid file-wide `@ts-nocheck` as a routine fix. Neither suppression validates runtime behavior.

**Source:** [Scoped compiler suppressions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html#ts-expect-error-comments). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
