# readonly-type-helper

**When:** A function receives an object it shouldn't mutate.

## Bad
```typescript
function logUser(user: { name: string; age: number }) {
  user.age = 0; // Accidentally mutates!
  console.log(user.name);
}
```

## Good
```typescript
function logUser(user: Readonly<{ name: string; age: number }>) {
  user.age = 0; // Error: Cannot assign to 'age'
  console.log(user.name);
}
```

## Why
`Readonly<T>` makes all properties readonly, preventing accidental mutations. This is especially important for functions that should only read data.
