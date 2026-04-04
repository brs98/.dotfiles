# avoid-double-assertion

**When:** Using `as unknown as T` or `as any as T` to force a type conversion.

## Bad
```typescript
const input = "hello";
const num = input as unknown as number; // Compiles but wrong!
num.toFixed(2); // Runtime error
```

## Good
```typescript
const input = "hello";
const num = Number(input); // Actual conversion
if (!isNaN(num)) {
  num.toFixed(2); // Safe
}

// Or use type guards for validation:
function isNumber(value: unknown): value is number {
  return typeof value === "number";
}
```

## Why
Double assertions bypass all type checking and hide bugs. If you need to convert types, use actual runtime conversion or type guards that validate the data.
