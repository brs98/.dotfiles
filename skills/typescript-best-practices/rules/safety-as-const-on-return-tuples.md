# Preserve intended tuple returns

**When:** A return value has fixed positions with different meanings, and an inferred array loses that relationship.

```typescript
function createCell<T>(initial: T) {
  let current = initial;
  const read = () => current;
  const write = (next: T) => { current = next; };
  return [read, write] as const;
}

const [read, write] = createCell(0);
write(1);
const value: number = read(); // 1 at runtime; both slots have distinct types.

// An explicit tuple contract is another valid choice, including mutable tuples.
function pair(): [string, number] {
  return ["ready", 1];
}
pair()[0] = "updated";
```

Use `as const` when a readonly tuple contract is intended. Explicit return annotations and contextual typing can also produce tuples. An ordinary homogeneous array return is valid when callers need array behavior; do not add `as const` merely because a return expression contains two or more elements.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [TS readonly tuples and const assertions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#const-assertions).
