# Make union case handling exhaustive when required

**When:** All variants must be handled. A switch can organize cases; equivalent if/else code can also narrow correctly.

```typescript
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; sideLength: number }
  | { kind: "triangle"; base: number; height: number };

function assertNever(value: never): never {
  throw new Error(`Unhandled shape: ${JSON.stringify(value)}`);
}

function calculateArea(shape: Shape): number {
  switch (shape.kind) {
    case "circle": return Math.PI * shape.radius ** 2;
    case "square": return shape.sideLength ** 2;
    case "triangle": return shape.base * shape.height / 2;
    default: return assertNever(shape);
  }
}
```

Adding a variant without a case makes the `assertNever(shape)` call fail type checking. A switch alone does not enforce exhaustiveness; an explicit non-undefined return contract can also reveal fallthrough under strict null checks. Choose switch versus if/else for readability, not a claimed difference in narrowing power. Do not mechanically rewrite repeated getter or function-call comparisons: a switch evaluates its discriminant once, while the original chain may evaluate it repeatedly.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Handbook exhaustiveness checking](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking).
