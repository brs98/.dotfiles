# Preserve discriminant relationships when destructuring

**When:** Destructuring a union produces missing-property or lost-correlation errors. Destructuring is not categorically unsafe.

```typescript
type Shape = { kind: "circle"; radius: number } | { kind: "square"; sideLength: number };

// @ts-expect-error Variant-only properties are not available before narrowing.
function invalid({ kind, radius, sideLength }: Shape) {}

function area(shape: Shape): number {
  if (shape.kind === "circle") {
    const { radius } = shape;
    return Math.PI * radius ** 2;
  }
  return shape.sideLength ** 2;
}

type Action = { kind: "number"; payload: number } | { kind: "string"; payload: string };
function format({ kind, payload }: Action): string {
  return kind === "number" ? payload.toFixed(2) : payload.toUpperCase();
}

function lostRestCorrelation({ kind, ...rest }: Action) {
  if (kind === "number") {
    // @ts-expect-error Checking kind does not correlate the separate rest object.
    return rest.payload.toFixed(2);
  }
}
```

Since TS 4.6, const destructuring and eligible destructured parameters that remain unchanged can preserve relationships between common fields. Variant-only fields must still be accessed after narrowing. Rest bindings, defaults, reassignment, and separately extracted values can lose correlation; inspect the actual use instead of banning destructuring or requiring the original reference everywhere.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [TS 4.6 destructured union analysis](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-6.html#control-flow-analysis-for-destructured-discriminated-unions), [Workshop qualified destructuring guidance](https://www.totaltypescript.com/workshops/typescript-pro-essentials/unions-and-narrowing/destructuring-a-discriminated-union-in-typescript/solution).
