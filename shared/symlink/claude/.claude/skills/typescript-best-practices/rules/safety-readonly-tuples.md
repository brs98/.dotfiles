# readonly-tuples

**When:** Declaring tuple types that shouldn't be mutated.

## Bad
```typescript
type Point = [number, number];
function distance(p: Point) {
  p[0] = 0; // Mutation allowed!
}
```

## Good
```typescript
type Point = readonly [number, number];
function distance(p: Point) {
  p[0] = 0; // Error: Cannot assign to '0'
  return Math.sqrt(p[0] ** 2 + p[1] ** 2); // Read-only access OK
}
```

## Why
Add `readonly` to tuple types to prevent index assignment. This catches accidental mutations and documents that the tuple should not be modified.
