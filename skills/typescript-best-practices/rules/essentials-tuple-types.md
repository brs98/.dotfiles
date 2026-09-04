# Tuple contracts

**When:** Positions and length form part of an API contract.

Use a tuple for heterogeneous or fixed-position data. A short array initializer alone does not imply a tuple contract.

```typescript
function rangeWidth(range: readonly [number, number]) { return range[1] - range[0]; }
rangeWidth([2, 5]);
// @ts-expect-error A range requires both endpoints.
rangeWidth([2]);
```

With `noUncheckedIndexedAccess`, ordinary array indexing includes `undefined`; known required tuple positions do not. Tuple typing does not freeze a JavaScript array at runtime. A readonly tuple prevents mutation through that reference and accepts mutable tuples as inputs.

**Source:** [Tuple contracts](https://www.typescriptlang.org/docs/handbook/2/objects.html#tuple-types). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
