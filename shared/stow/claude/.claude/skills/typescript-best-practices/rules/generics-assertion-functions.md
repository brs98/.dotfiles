# assertion-functions

**When:** A function validates input and throws on invalid values.

## Bad
```typescript
function assertNumber(value: unknown) {
  if (typeof value !== "number") throw new Error("Not a number");
}
const input: unknown = 42;
assertNumber(input);
input.toFixed(2); // Error: input still unknown
```

## Good
```typescript
function assertNumber(value: unknown): asserts value is number {
  if (typeof value !== "number") throw new Error("Not a number");
}
const input: unknown = 42;
assertNumber(input);
input.toFixed(2); // OK - narrowed to number after assertion
```

## Why
Assertion functions (`asserts param is Type`) narrow the type for all code after the call. If the assertion doesn't throw, TypeScript knows the value is the asserted type.
