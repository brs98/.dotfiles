# Optional parameters and properties

**When:** Callers are allowed to omit an argument or property.

Use `?` for an omittable argument. Preserve `T | undefined` when callers must supply the slot, including when forwarding a possibly absent value.

```typescript
function greet(name?: string) { return name ?? "guest"; }
function forward(name: string | undefined) { return greet(name); }
greet();
forward(undefined);
// @ts-expect-error The slot is required.
forward();
```

With `exactOptionalPropertyTypes: true`, `name?: string` on an **object property** permits absence but not explicit `undefined`; use `name?: string | undefined` if both are intended. This option does not change optional-parameter semantics. Making a required parameter optional changes the public contract, even if it is last.

**Source:** [Optional parameters and properties](https://www.typescriptlang.org/tsconfig/exactOptionalPropertyTypes.html). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
