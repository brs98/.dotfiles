# Intentional inheritance

**When:** A subclass has an intentional subtype relationship and shares behavior with its base.

Inheritance is one design choice; shared helper functions or composition may fit independent concepts better.

```typescript
class Animal {
  constructor(public name: string) {}
  describe() { return this.name; }
}
class Dog extends Animal {
  bark() { return `${this.name}: woof`; }
}
```

Do not introduce inheritance solely because methods look similar. Child field initializers can intentionally replace inherited values; removing them changes runtime behavior. Type-only `declare` refinements and emitted fields also have different semantics.

**Source:** [Intentional inheritance](https://www.typescriptlang.org/docs/handbook/2/classes.html#extends-clauses). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
