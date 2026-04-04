# propertykey-for-any-key-type

**When:** Writing a function that accepts object keys of any valid type.

## Bad
```typescript
function getProperty<T>(obj: T, key: string | number | symbol) {
  return obj[key];
}
```

## Good
```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
// Or for generic key constraints:
function hasKey(obj: object, key: PropertyKey): key is keyof typeof obj {
  return key in obj;
}
```

## Why
`PropertyKey` is the built-in type alias for `string | number | symbol` - all valid JavaScript object keys. It's more readable and self-documenting.
