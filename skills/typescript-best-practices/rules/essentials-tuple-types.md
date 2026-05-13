# tuple-types

**When:** An array must have a fixed number of elements with specific types at each position.

## Bad
```typescript
const setRange = (range: number[]) => {
  const x = range[0]; // type: number | undefined
  const y = range[1]; // type: number | undefined
};

setRange([0]);        // Allowed but wrong - missing y
setRange([0, 10, 20]); // Allowed but wrong - too many
```

## Good
```typescript
const setRange = (range: [number, number]) => {
  const x = range[0]; // type: number
  const y = range[1]; // type: number
};

setRange([0, 10]);     // Correct
setRange([0]);         // Error: missing element
setRange([0, 10, 20]); // Error: too many elements

// Optional tuple members use ?
type Coords = [number, number, number?]; // z is optional
```

## Why
Tuples give you fixed-length arrays with known types at each index. Use `[Type1, Type2]` syntax instead of `Type[]` when position matters.
