# Account for unchecked indexed values

**When:** Accessing arrays or index signatures without proof that the requested key exists.

With `strict: true` and `noUncheckedIndexedAccess: true`:

```typescript
const values = [1, 2, 3];
const value = values[5]; // number | undefined
if (value !== undefined) {
  value.toFixed(2);
}
```

Without the additional flag, this unchecked array access is typed as `number` even though the actual value is `undefined`. The option adds `undefined` to potentially missing array/index-signature lookups; it does not change every property access. Known properties and valid fixed tuple positions retain their known types. Strict null checking is needed for this distinction to protect subsequent use.

**Validation:** Example checked with TypeScript 5.9.2, strict and noUncheckedIndexedAccess enabled.

**Source:** [TypeScript noUncheckedIndexedAccess](https://www.typescriptlang.org/tsconfig/noUncheckedIndexedAccess.html)
