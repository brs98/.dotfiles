# Narrow primitive unions at type-specific operations

**When:** An operation is unavailable on some members of a primitive union at the actual use.

```typescript
function format(value: string | number): string {
  if (typeof value === "number") return value.toFixed(2);
  return value.toUpperCase();
}

function stringify(value: string | number): string {
  return value.toString(); // This method is shared, so no guard is needed.
}

function misplacedGuard(value: string | number) {
  if (typeof value === "string") console.log("String received");
  // @ts-expect-error The earlier guard does not narrow this later unguarded use.
  return value.toFixed(2);
}
```

Use the current flow type, not the mere presence of a `typeof` expression somewhere in the function. TypeScript supports equivalent control-flow patterns and reusable [type guards](narrowing-type-predicates.md); it does not require one particular guard syntax for every union value. Remember `typeof null` is `"object"` when validating unknown inputs.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Workshop typeof narrowing](https://www.totaltypescript.com/workshops/typescript-pro-essentials/unions-and-narrowing/narrowing-unions-with-typeof).
