# type-predicates

**When:** You have reusable type guard logic that you want to extract into a function.

## Bad
```typescript
const isStringArray = (value: unknown) => {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
};

if (isStringArray(input)) {
  input.join(" "); // Error: input is still unknown
}
```

## Good
```typescript
const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
};

if (isStringArray(input)) {
  input.join(" "); // input is string[]
}
```

## Why
Type predicates (`value is Type`) tell TypeScript that when the function returns true, the parameter has been narrowed to the specified type. This enables reusable type guards that properly narrow in calling code.
