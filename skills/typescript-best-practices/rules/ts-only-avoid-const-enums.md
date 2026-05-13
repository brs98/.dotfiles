# avoid-const-enums

**When:** Using enums that need to work across different build tools (ESBuild, SWC, Babel).

## Bad
```typescript
// const enums require TypeScript compiler to understand values
const enum Direction {
  Up = "UP",
  Down = "DOWN",
}

const move = Direction.Up;
```

## Good
```typescript
// Use regular objects with as const for predictable behavior
const Direction = {
  Up: "UP",
  Down: "DOWN",
} as const;

type Direction = (typeof Direction)[keyof typeof Direction];
```

## Why
Const enums require the TypeScript compiler to resolve values during transpilation. Build tools like ESBuild and SWC only process the AST without full type information, causing inconsistent behavior.
