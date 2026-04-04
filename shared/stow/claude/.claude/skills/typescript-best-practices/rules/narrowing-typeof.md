# typeof-narrowing

**When:** You need to narrow a union of primitive types like `string | number | boolean`.

## Bad
```typescript
function format(value: string | number) {
  return value.toFixed(2); // Error: toFixed doesn't exist on string
}
```

## Good
```typescript
function format(value: string | number) {
  if (typeof value === "number") {
    return value.toFixed(2); // value is number
  }
  return value.toUpperCase(); // value is string
}
```

## Why
TypeScript understands `typeof` checks and narrows the type within each branch. The else branch automatically gets the remaining types from the union. This is the standard way to narrow primitive types.
