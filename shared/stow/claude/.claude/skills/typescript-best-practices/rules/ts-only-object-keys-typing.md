# object-keys-typing

**When:** Iterating over object keys with `Object.keys()` and expecting typed keys.

## Bad
```typescript
const user = { name: "Alice", age: 30 };
Object.keys(user).forEach((key) => {
  console.log(user[key]); // Error: No index signature
});
```

## Good
```typescript
// Option 1: Type assertion
(Object.keys(user) as Array<keyof typeof user>).forEach((key) => {
  console.log(user[key]); // OK
});

// Option 2: Type guard
function isKeyOf<T extends object>(obj: T, key: PropertyKey): key is keyof T {
  return key in obj;
}
```

## Why
TypeScript intentionally types `Object.keys()` as `string[]` because objects can have excess properties at runtime that aren't in the type definition. The assertion is safe when you control the object.
