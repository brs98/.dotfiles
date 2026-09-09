# Use Readonly<T> for shallow read-only contracts

**When:** An object parameter's top-level properties should not be reassigned through that reference.

```typescript
type User = { name: string; profile: { visits: number } };

function logUser(user: Readonly<User>) {
  console.log(user.name);
  // @ts-expect-error Readonly<User> rejects replacing a top-level property.
  user.name = "Changed";
}

function recordVisit(user: Readonly<User>) {
  user.profile.visits++; // Nested objects remain mutable.
}
```

`Readonly<T>` is shallow and compile-time only. It neither freezes objects nor prevents writes through other mutable aliases. For literal-expression readonly types, see [as const](safety-as-const-deep-readonly.md).

Changing a function to readonly is an intent decision. If it deliberately mutates the input, preserve that contract; if a write is accidental, fix the write and then express the read-only contract. A function's name alone cannot establish whether mutation is correct.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Workshop Readonly helper](https://www.totaltypescript.com/workshops/typescript-pro-essentials/mutability/using-a-type-helper-to-create-read-only-properties/solution).
