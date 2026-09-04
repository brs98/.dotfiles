# Express non-mutating array inputs

**When:** A function's intended input contract permits reading an array but not changing its structure.

```typescript
function getFirst<T>(items: readonly T[]): T | undefined {
  return items[0];
}
const mutable = [1, 2, 3];
const fixed = [1, 2, 3] as const;
getFirst(mutable);
getFirst(fixed); // Both mutable and readonly inputs are accepted.

function renameFirst(users: ReadonlyArray<{ name: string }>) {
  const first = users[0];
  if (first) first.name = "Updated"; // Elements are not automatically readonly.
  // @ts-expect-error ReadonlyArray has no mutating push method.
  users.push({ name: "New" });
}
```

Use `readonly T[]` or `ReadonlyArray<T>`, not `readonly Array<T>`. This contract neither freezes the array nor makes nested elements readonly. Check delegated calls, aliases, returned values, and callback contracts before changing an existing parameter: absence of a direct `push` does not prove that the array is only read.

Rest parameters create a fresh array for the function. Making that array readonly is optional internal discipline, not needed to protect the caller's array structure.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Handbook readonly arrays](https://www.typescriptlang.org/docs/handbook/2/objects.html#the-readonlyarray-type).
