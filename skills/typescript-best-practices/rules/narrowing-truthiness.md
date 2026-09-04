# Choose truthiness or nullish checks according to valid values

**When:** Narrowing a possibly absent value. Decide whether other falsy values are also invalid.

```typescript
function validateUsername(username: string | null): boolean {
  if (username) return username.length > 5;
  return false; // Rejecting the empty string is intended here.
}

function displayCount(count: number | null | undefined): string {
  if (count != null) return String(count); // Preserves 0 and NaN.
  return "Missing";
}

function displayLabel(label: string | null | undefined): string {
  if (label !== null && label !== undefined) return label; // Preserves "".
  return "Missing";
}
```

Truthiness excludes `""`, `0`, `false`, and `NaN`, as well as null and undefined. A nullish check preserves those values. Choose loose equality or explicit null/undefined checks according to project style; use direct control-flow expressions rather than assuming `Boolean(value)` produces narrowing.

When simplifying repeated checks, preserve evaluation order and count. Calls, getters, or comparisons separated by side effects cannot be combined mechanically into a single nullish comparison, even if their source text matches.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Handbook truthiness narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#truthiness-narrowing), [Workshop username validation](https://www.totaltypescript.com/workshops/typescript-pro-essentials/unions-and-narrowing/conditional-narrowing-in-typescript/solution).
