# parameters-for-function-args

**When:** You need to type arguments that match an existing function's parameters.

## Bad
```typescript
function log(message: string, level: "info" | "warn" | "error") { ... }
type LogArgs = [string, "info" | "warn" | "error"]; // Duplicated
```

## Good
```typescript
function log(message: string, level: "info" | "warn" | "error") { ... }
type LogArgs = Parameters<typeof log>; // [string, "info" | "warn" | "error"]
type Level = Parameters<typeof log>[1]; // "info" | "warn" | "error"
```

## Why
`Parameters<typeof fn>` extracts the parameter types as a tuple. Use indexed access `[0]`, `[1]`, etc. to get individual parameter types.
