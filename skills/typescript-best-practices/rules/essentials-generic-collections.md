# Generic collections

**When:** Creating a collection without values that establish the intended element/key/value type.

Use type arguments or a contextual annotation when a specific contract is needed. Initialized collections commonly infer it already.

```typescript
const ids = new Set<number>();
const names = new Map<string, string>();
const inferred = new Set([1, 2]); // Set<number>
const contextual: Set<number> = new Set();
```

Inspect the inferred type and the installed library declarations. In TypeScript 5.9, an unconstrained empty `Set` can infer `Set<unknown>`; an empty `Map` defaults to `Map<any, any>`. `unknown` requires narrowing before use, while `any` permits unchecked operations. An explicit argument can also intentionally widen a collection for later values.

**Source:** [Generic collections](https://www.typescriptlang.org/docs/handbook/type-inference.html). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
