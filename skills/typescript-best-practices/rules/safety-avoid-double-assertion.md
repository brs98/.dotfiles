# Avoid assertions as a substitute for conversion

**When:** An `as unknown as T` or `as any as T` chain forces an incompatible source into a target type.

```typescript
function unsafeConversion(input: string) {
  const number = input as unknown as number;
  return number.toFixed(2); // Compiles, but input is still a string at runtime.
}

function parseFiniteNumber(input: string): number | undefined {
  const number = Number(input);
  return Number.isFinite(number) ? number : undefined;
}

function formatInput(input: string): string | undefined {
  const number = parseFiniteNumber(input);
  return number === undefined ? undefined : number.toFixed(2);
}
```

Double assertions bypass compatibility checking between the original source and asserted target. Later operations are still checked as `T`. Assertions neither convert nor validate values, including when parentheses or angle-assertion syntax hide the chain. A const assertion followed by an ordinary compatible assertion is not inherently the same escape hatch.

Prefer real conversion or [truthful guards](narrowing-type-predicates.md). When interoperability or a compiler limitation requires an assertion, isolate it and document the independently established invariant; do not turn that exception into unchecked boundary validation.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Handbook type assertions](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions).
