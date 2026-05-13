# empty-object-type

**When:** Using `{}` as a type annotation expecting it to mean "empty object".

## Bad
```typescript
const acceptEmpty = (input: {}) => {};
acceptEmpty("hello"); // OK - not what you expect!
acceptEmpty(42);      // OK - not what you expect!
acceptEmpty(null);    // Error - only null/undefined rejected
```

## Good
```typescript
// For truly empty objects:
const acceptOnlyEmptyObject = (input: Record<string, never>) => {};
acceptOnlyEmptyObject({});       // OK
acceptOnlyEmptyObject({ a: 1 }); // Error

// For "any non-nullish value":
const acceptNonNullish = (input: NonNullable<unknown>) => {};
```

## Why
The empty object type `{}` means "any value with zero or more properties" - essentially anything except `null` and `undefined`. Use `Record<string, never>` for truly empty objects.
