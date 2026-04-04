# returntype-for-function-returns

**When:** You need the return type of an existing function without duplicating it.

## Bad
```typescript
function createUser() {
  return { id: crypto.randomUUID(), createdAt: new Date() };
}
type User = { id: string; createdAt: Date }; // Duplicated, can drift
```

## Good
```typescript
function createUser() {
  return { id: crypto.randomUUID(), createdAt: new Date() };
}
type User = ReturnType<typeof createUser>;
// { id: string; createdAt: Date } - derived automatically
```

## Why
`ReturnType<typeof fn>` extracts the return type directly from the function. The type stays in sync when the function changes, eliminating duplicate type definitions.
