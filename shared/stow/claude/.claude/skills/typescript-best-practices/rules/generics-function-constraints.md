# function-constraints

**When:** A generic function needs to access specific properties of its type parameter.

## Bad
```typescript
function pluck<T>(items: T[], key: string): unknown[] {
  return items.map(item => (item as any)[key]); // Unsafe
}
```

## Good
```typescript
function pluck<T, K extends keyof T>(items: T[], key: K): T[K][] {
  return items.map(item => item[key]);
}

const users = [{ name: "Alice", age: 30 }];
const names = pluck(users, "name"); // string[]
const ages = pluck(users, "age"); // number[]
pluck(users, "invalid"); // Error: not a key of User
```

## Why
Use `K extends keyof T` to constrain a type parameter to valid keys. This provides autocomplete, type safety, and correctly typed return values.
