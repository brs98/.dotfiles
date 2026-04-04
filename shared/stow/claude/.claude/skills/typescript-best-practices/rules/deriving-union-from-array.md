# union-from-array

**When:** You need a union type from the elements of a constant array.

## Bad
```typescript
const ROLES = ["admin", "user", "guest"];
type Role = "admin" | "user" | "guest"; // Duplicated, can drift
```

## Good
```typescript
const ROLES = ["admin", "user", "guest"] as const;
type Role = (typeof ROLES)[number]; // "admin" | "user" | "guest"
```

## Why
`(typeof arr)[number]` extracts a union of all element types. The `as const` assertion is required to preserve literal types instead of widening to `string[]`.
