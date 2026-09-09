# Model distinct object states with literal tags

**When:** A domain has distinct variants with different required fields. A discriminated union can express that relationship without unrelated optional properties.

```typescript
type LooseShape = { kind: string; radius?: number; sideLength?: number };
function unsafeArea(shape: LooseShape) {
  if (shape.kind === "circle") {
    // @ts-expect-error A string kind does not prove radius is present.
    return Math.PI * shape.radius * shape.radius;
  }
}

type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; sideLength: number };

function calculateArea(shape: Shape): number {
  if (shape.kind === "circle") return Math.PI * shape.radius ** 2;
  return shape.sideLength ** 2;
}
```

A required common tag with disjoint literal values identifies the variant. Giving every member the same literal value does not distinguish them; making the tag optional leaves ambiguity. Structural unions can intentionally use other guards, so do not add a tag solely because an object union has several members. For complete case handling, see [exhaustiveness](narrowing-switch-statements.md).

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Handbook discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions).
