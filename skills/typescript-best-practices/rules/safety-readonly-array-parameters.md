# readonly-array-parameters

**When:** A function receives an array it shouldn't mutate.

## Bad
```typescript
function getFirst<T>(items: T[]): T | undefined {
  return items.shift(); // Mutates the original array!
}
```

## Good
```typescript
function getFirst<T>(items: readonly T[]): T | undefined {
  return items[0]; // Cannot mutate
}

// Also accepts regular arrays:
const arr = [1, 2, 3];
getFirst(arr); // Works - T[] is assignable to readonly T[]
```

## Why
`readonly T[]` prevents accidental mutations inside functions. Regular arrays are assignable to readonly, so callers don't need to change anything.

## Note
Rest parameters (`...args: T[]`) are excluded from this rule — they always create a fresh array at the call site, so `readonly` only guards against internal mutation (low practical value).
