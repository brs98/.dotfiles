# avoid-over-annotation

**When:** Adding type annotations to variables TypeScript can already infer.

## Bad
```typescript
const name: string = "Alice";
const count: number = 42;
const items: string[] = ["a", "b", "c"];
```

## Good
```typescript
const name = "Alice"; // inferred: "Alice" (literal)
const count = 42; // inferred: 42 (literal)
const items = ["a", "b", "c"]; // inferred: string[]
```

## Why
Explicit annotations can actually widen types (losing literals) and add noise. Let TypeScript infer when possible - only annotate when you need a wider type or inference fails.
