# catch-block-typing

**When:** Trying to type the error parameter in a catch block.

## Bad
```typescript
try {
  JSON.parse(input);
} catch (e: SyntaxError) { // Error: must be any or unknown
  console.error(e.message);
}
```

## Good
```typescript
try {
  JSON.parse(input);
} catch (e) {
  if (e instanceof SyntaxError) {
    console.error(e.message); // Narrowed to SyntaxError
  } else if (e instanceof Error) {
    console.error(e.message); // Narrowed to Error
  } else {
    console.error("Unknown error", e);
  }
}
```

## Why
TypeScript doesn't support annotating thrown errors on functions - anything can be thrown. The catch parameter is always `unknown` (or `any`). Use `instanceof` to narrow the error type within the catch block.
