# Unknown at unchecked boundaries

**When:** Accepting values whose runtime shape has not been established.

Prefer `unknown` to `any` for external input. Narrow at the point of use, or decode into a validated internal model.

```typescript
function label(input: unknown): string {
  if (typeof input === "string") return input;
  if (typeof input === "object" && input !== null && "name" in input && typeof input.name === "string") return input.name;
  throw new Error("Expected a label");
}
```

A truthful type predicate must describe both branches; a partial validator such as “nonempty string” cannot claim `x is string` for a `string | number` input. Prefer inferred predicates for simple complete checks. See [type predicates](narrowing-type-predicates.md) and [JSON boundaries](essentials-typing-json-parse.md).

**Source:** [Unknown at unchecked boundaries](https://www.typescriptlang.org/docs/handbook/2/functions.html#unknown). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
