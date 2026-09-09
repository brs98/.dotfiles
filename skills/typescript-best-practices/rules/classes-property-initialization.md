# Class initialization

**When:** A field has a simple, unconditional default value.

An inline initializer makes a simple default easy to find.

```typescript
class Counter { count = 0; }
class NamedCounter {
  count: number;
  constructor(start: number) { this.count = start; }
}
```

Constructor initialization remains appropriate for argument-dependent values and ordering. Under `strictPropertyInitialization`, initialize required fields on every constructor path or model their possible absence. `!` is a trusted external-initialization assertion, not initialization. Comparisons, conditional assignments and callbacks do not necessarily initialize a field.

**Source:** [Class initialization](https://www.typescriptlang.org/docs/handbook/2/classes.html#fields). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
