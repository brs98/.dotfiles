# optional-parameters

**When:** A function parameter or object property may not always be provided and callers should be able to omit the argument entirely.

## Bad
```typescript
const concatName = (first: string, last: string) => {
  if (!last) return first;
  return `${first} ${last}`;
};

concatName("John"); // Error: Expected 2 arguments, but got 1
```

## Good
```typescript
const concatName = (first: string, last?: string) => {
  if (!last) return first;
  return `${first} ${last}`;
};

concatName("John"); // Works correctly
concatName("John", "Doe"); // Also works
```

## Exception — keep `| undefined` when the argument is always passed

```typescript
// CORRECT — callers always pass a value, but it may be undefined
function isMutationFunction(name: string | undefined): boolean {
  if (!name) return false;
  return name.toLowerCase().includes("set");
}
const fnName = node.getName(); // string | undefined
isMutationFunction(fnName);    // always passes the value

// WRONG — changing to ? would let callers omit the argument entirely
function isMutationFunction(name?: string): boolean { ... }
isMutationFunction(); // now allowed but not intended
```

## Why
The `?` modifier tells TypeScript the parameter is optional, allowing callers to omit it. Works for both function parameters and object properties.

The key distinction: `?` means the argument slot is omittable; `| undefined` means the argument is required but its value may be undefined. Use `?` when callers should be able to pass fewer arguments. Keep `| undefined` when callers always provide the argument but forward a value whose type includes `undefined`.
