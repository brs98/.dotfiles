# record-with-union-keys

**When:** Creating an object that must have exactly the keys from a union type.

## Bad
```typescript
type Status = "pending" | "success" | "error";
type Messages = { [K in Status]?: string };
// Optional - might miss keys
```

## Good
```typescript
type Status = "pending" | "success" | "error";
type Messages = Record<Status, string>;
// { pending: string; success: string; error: string }
// All keys required - compile error if any missing
```

## Why
`Record<UnionType, ValueType>` enforces that every member of the union has a corresponding property, catching missing cases at compile time.
