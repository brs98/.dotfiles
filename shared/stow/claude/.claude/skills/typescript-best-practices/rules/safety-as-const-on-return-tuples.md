# as-const-on-return-tuples

**When:** Returning a tuple from a function and wanting proper tuple inference.

## Bad
```typescript
function useState<T>(initial: T) {
  return [initial, (v: T) => {}]; // Inferred as (T | ((v: T) => void))[]
}
const [value, setValue] = useState(0);
setValue(1); // Error: not callable - it's a union!
```

## Good
```typescript
function useState<T>(initial: T) {
  return [initial, (v: T) => {}] as const;
  // Inferred as readonly [T, (v: T) => void]
}
const [value, setValue] = useState(0);
setValue(1); // Works - properly typed as function
```

## Why
Without `as const`, array literals are inferred as arrays (not tuples), creating a union of all element types. `as const` preserves the tuple structure and individual element types.
