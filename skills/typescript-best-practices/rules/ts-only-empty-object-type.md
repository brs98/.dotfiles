# Distinguish non-nullish values from an empty shape

**When:** `{}` is being used under the mistaken assumption that it means an object with no keys. Requires strict null checking.

```typescript
const acceptNonNullish = (input: {}) => input;
acceptNonNullish("hello"); // Valid: primitives can be non-nullish.
acceptNonNullish(42);
// @ts-expect-error Null is not a non-nullish value.
acceptNonNullish(null);
```

For a static constraint that permits no string, number or symbol properties:

```typescript
const acceptEmpty = (input: Record<PropertyKey, never>) => input;
acceptEmpty({});
// @ts-expect-error This property is not permitted.
acceptEmpty({ a: 1 });
const token = Symbol("token");
// @ts-expect-error Symbol properties are not permitted either.
acceptEmpty({ [token]: 1 });
```

`Record<string, never>` does not express the same restriction on symbol keys. This is static shape checking, not proof that an arbitrary runtime object has no keys; structural typing and assertions can hide runtime properties.

Keep `{}` when non-nullish values are the actual intent, including `T extends {}` constraints and `T & {}` intersections. Use `object` for non-primitive values or `unknown` when nullish values should also be allowed; these types have different contracts.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [Workshop empty-object solution](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/050-the-weird-parts/151-truly-empty-object.solution.1.ts), [TypeScript 4.8 non-nullish intersections](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-8.html)
