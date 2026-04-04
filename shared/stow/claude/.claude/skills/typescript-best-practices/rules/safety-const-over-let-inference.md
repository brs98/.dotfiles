# const-over-let-inference

**When:** Declaring a variable that won't be reassigned.

## Bad
```typescript
let status = "pending"; // type: string (widened)
let count = 0; // type: number (widened)
```

## Good
```typescript
const status = "pending"; // type: "pending" (literal)
const count = 0; // type: 0 (literal)
```

## Why
`const` tells TypeScript the value won't change, enabling literal type inference. `let` variables are widened because they might be reassigned to other values of the same type.
