# function-default-type

**When:** A generic function has a sensible default type when inference isn't possible.

## Bad
```typescript
function createState<T>(): { value: T | undefined; set: (v: T) => void } {
  let value: T | undefined;
  return { value, set: (v) => { value = v; } };
}
const state = createState(); // T is unknown - not useful
```

## Good
```typescript
function createState<T = unknown>(): { value: T | undefined; set: (v: T) => void } {
  let value: T | undefined;
  return { value, set: (v) => { value = v; } };
}
const state = createState<number>(); // Explicit when needed
const anyState = createState(); // Defaults to unknown
```

## Why
Default type parameters provide a fallback when inference isn't possible (e.g., no arguments to infer from). This improves ergonomics while keeping the function generic.
