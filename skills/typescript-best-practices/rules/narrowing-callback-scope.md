# Capture the value that was narrowed

**When:** A callback's actual use no longer has the narrowed type, especially for a mutable object property.

```typescript
type User = { name: string };

function unsafeSearch(search: { name?: string }, users: readonly User[]) {
  if (search.name !== undefined) {
    return users.filter(user => {
      // @ts-expect-error The mutable property may change before this callback runs.
      return user.name.includes(search.name);
    });
  }
  return users;
}

function findUsers(search: { name?: string }, users: readonly User[]) {
  const name = search.name;
  if (name === undefined) return users;
  return users.filter(user => user.name.includes(name));
}

function makeFormatter(value: string | number) {
  if (typeof value === "string") return () => value.toUpperCase();
  return () => value.toFixed(2); // Eligible parameter narrowing is preserved.
}
```

A snapshot captures the checked value; rechecking inside the callback instead uses the current value. Choose the behavior intended by the application. TS 5.4+ preserves narrowing for eligible parameters and let bindings after their last assignment in non-hoisted closures. Const bindings can also retain narrowing. Do not assume every callback loses it, and do not infer safety from a guard elsewhere in the function: inspect the type at the actual use.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [TS 5.4 preserved closure narrowing](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-4.html#preserved-narrowing-in-closures-following-last-assignments), [Workshop callback scope](https://www.totaltypescript.com/workshops/typescript-pro-essentials/unions-and-narrowing/narrowing-in-different-scopes/solution).
