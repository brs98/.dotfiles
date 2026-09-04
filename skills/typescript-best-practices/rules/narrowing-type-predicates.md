# Reuse truthful guards; prefer inferred predicates when available

**When:** A reusable boolean check should narrow its input for callers. This is the canonical predicate guidance, including for [generic guards](generics-type-predicates.md).

```typescript
// TS 5.5+ infers value is string[] for this complete check.
const isStringArray = (value: unknown) =>
  Array.isArray(value) && value.every(item => typeof item === "string");

function joinIfStrings(input: unknown): string | undefined {
  return isStringArray(input) ? input.join(" ") : undefined;
}

// An explicit boolean return suppresses predicate inference.
const booleanCheck = (value: unknown): boolean => typeof value === "string";
function notNarrowed(input: unknown) {
  if (booleanCheck(input)) {
    // @ts-expect-error An explicit boolean result is not a type predicate.
    return input.toUpperCase();
  }
}

// A complete explicit predicate can still express an intentional contract.
function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

// This is a partial validator: false can mean number OR an empty string.
function nonempty(value: string | number): boolean {
  return typeof value === "string" && value.length > 0;
}
function retainBothTypes(value: string | number) {
  if (!nonempty(value)) {
    // @ts-expect-error It would be unsound to assume the false branch is number.
    return value.toFixed(2);
  }
}
```

TS 5.5 inference requires an eligible single-return function, no explicit return annotation, no parameter mutation, and a boolean expression tied to refinement. When it works, let the compiler derive the predicate. Retain `boolean` for partial validation or a deliberately non-narrowing contract.

An explicit `value is T` is trusted: TypeScript does not prove its runtime claim. It must identify `T` truthfully on success **and exclude `T` on failure**. A check for a nonempty string must not claim merely `value is string`; that would incorrectly eliminate empty strings in the else branch. Compound guards and unions can be legitimate predicates, but the presence of `typeof`, `in`, or `instanceof` alone proves nothing about that two-sided contract.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [TS 5.5 predicate inference and semantics](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-5.html#inferred-type-predicates), [Workshop reusable guard solution](https://www.totaltypescript.com/workshops/typescript-pro-essentials/unions-and-narrowing/reusable-type-guards/solution).
