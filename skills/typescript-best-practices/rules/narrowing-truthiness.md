# truthiness-narrowing

**When:** You need to check if a value is null, undefined, or falsy before using it.

## Bad
```typescript
function validateUsername(username: string | null): boolean {
  return username.length > 5; // Error: username possibly null
}
```

## Good
```typescript
function validateUsername(username: string | null): boolean {
  if (username) {
    return username.length > 5; // username is string
  }
  return false;
}
```

## Why
TypeScript narrows nullable types when checking truthiness. Inside the if block, null and undefined are excluded. Note: `Boolean(value)` does NOT narrow - use `!!value` or direct truthiness checks instead.
