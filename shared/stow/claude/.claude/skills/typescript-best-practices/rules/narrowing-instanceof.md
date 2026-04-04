# instanceof-narrowing

**When:** You need to check if a value is an instance of a class, especially for error handling in try-catch blocks.

## Bad
```typescript
try {
  somethingDangerous();
} catch (error) {
  console.error(error.message); // Error: error is unknown
}
```

## Good
```typescript
try {
  somethingDangerous();
} catch (error) {
  if (error instanceof Error) {
    console.error(error.message); // error is Error
  }
}
```

## Why
Caught errors are typed as `unknown` by default. Using `instanceof Error` narrows to the Error class, giving access to `message`, `stack`, and other Error properties safely.
