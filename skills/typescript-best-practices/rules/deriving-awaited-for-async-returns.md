# awaited-for-async-returns

**When:** You need the resolved type from an async function (not the Promise wrapper).

## Bad
```typescript
async function fetchUser() {
  return { id: "1", name: "Alice" };
}
type User = ReturnType<typeof fetchUser>;
// Promise<{ id: string; name: string }> - still wrapped!
```

## Good
```typescript
async function fetchUser() {
  return { id: "1", name: "Alice" };
}
type User = Awaited<ReturnType<typeof fetchUser>>;
// { id: string; name: string } - unwrapped
```

## Why
Async functions return `Promise<T>`. Compose `Awaited<ReturnType<typeof fn>>` to unwrap the Promise and get the actual resolved value type.
