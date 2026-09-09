# Validate caught values before reading Error properties

**When:** A caught value may be an Error instance, or a class union needs runtime discrimination. This is the canonical catch-narrowing guidance; [catch-block typing](ts-only-catch-block-typing.md) covers the configuration context.

```typescript
function execute(action: () => void) {
  try {
    action();
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("Non-Error thrown", error);
    }
  }
}

// Structural validation is also appropriate when an Error instance is not required.
function errorMessage(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("message" in value)) return;
  return typeof value.message === "string" ? value.message : undefined;
}
```

Catch bindings are `unknown` with `useUnknownInCatchVariables`, enabled by `strict`. Writing `catch (error: unknown)` does not validate it; `any` suppresses checks without making it safe. A guard must apply at the use, not merely appear somewhere in the catch block. Choose `instanceof` when constructor identity matters; structurally valid or cross-realm objects may require another truthful check.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Catch variable configuration](https://www.typescriptlang.org/tsconfig/useUnknownInCatchVariables.html), [Workshop unknown errors](https://www.totaltypescript.com/workshops/typescript-pro-essentials/unions-and-narrowing/dealing-with-unknown-errors-in-typescript/solution).
