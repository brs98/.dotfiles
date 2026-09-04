# Enforced exhaustiveness

**When:** Every variant must be handled, including future additions.

An ordinary switch is not an exhaustiveness guarantee. Check the remaining value against `never` after handling every variant.

```typescript
type State = { kind: "loading" } | { kind: "ready"; count: number };
function assertNever(value: never): never { throw new Error(`Unexpected state: ${JSON.stringify(value)}`); }
function describe(state: State): string {
  switch (state.kind) {
    case "loading": return "Loading";
    case "ready": return String(state.count);
    default: return assertNever(state);
  }
}
```

Adding a variant produces a compile error at `assertNever` until it is handled. An exhaustive if chain can use the same check. A runtime throw also handles unexpected external values; type declarations alone do not validate input.

**Source:** [Enforced exhaustiveness](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#exhaustiveness-checking). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
