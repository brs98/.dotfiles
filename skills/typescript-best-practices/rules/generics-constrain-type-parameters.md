# constrain-type-parameters

**When:** A generic type parameter needs specific properties to be useful.

## Bad
```typescript
function getErrorMessage<T>(error: T) {
  return error.message; // Error: Property 'message' doesn't exist on T
}
```

## Good
```typescript
function getErrorMessage<T extends { message: string }>(error: T) {
  return error.message; // Safe - T guaranteed to have message
}

getErrorMessage(new Error("fail")); // Works
getErrorMessage({ message: "custom", code: 500 }); // Works
getErrorMessage("string"); // Error - no message property
```

## Why
Use `extends` to constrain type parameters to types with required properties. This lets TypeScript verify the property exists while keeping the function generic.
