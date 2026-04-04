# type-predicates

**When:** Creating reusable type guard functions.

## Bad
```typescript
function isString(value: unknown): boolean {
  return typeof value === "string";
}
const input: unknown = "hello";
if (isString(input)) {
  input.toUpperCase(); // Error: input still unknown
}
```

## Good
```typescript
function isString(value: unknown): value is string {
  return typeof value === "string";
}
const input: unknown = "hello";
if (isString(input)) {
  input.toUpperCase(); // OK - narrowed to string
}
```

## Why
Type predicates (`value is Type`) tell TypeScript that a successful check narrows the type. Without this return type annotation, the type guard won't narrow in the calling code.
