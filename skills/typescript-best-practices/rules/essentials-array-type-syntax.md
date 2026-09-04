# Array type syntax

**When:** Declaring a homogeneous collection.

`T[]` and `Array<T>` are equivalent. Follow the project convention; use parentheses for a union or function element type.

```typescript
const names: string[] = ["Ada"];
const alternatives: Array<string> = ["Ada"];
const values: (string | number)[] = ["Ada", 1];
const callbacks: Array<() => void> = [() => {}];
```

This is formatting guidance, not a safety distinction.

**Source:** [Array type syntax](https://www.typescriptlang.org/docs/handbook/2/objects.html#the-array-type). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
