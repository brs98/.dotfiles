# keyof-for-all-values

**When:** You need a union of all values from an object (not keys).

## Bad
```typescript
const STATUS = { pending: "PENDING", success: "SUCCESS", error: "ERROR" } as const;
type Status = "PENDING" | "SUCCESS" | "ERROR"; // Manual, can drift
```

## Good
```typescript
const STATUS = { pending: "PENDING", success: "SUCCESS", error: "ERROR" } as const;
type Status = (typeof STATUS)[keyof typeof STATUS];
// "PENDING" | "SUCCESS" | "ERROR" - derived from values
```

## Why
`Type[keyof Type]` creates a union of all value types in an object. Combined with `as const`, you get a union of literal values that stays in sync with the source object.
