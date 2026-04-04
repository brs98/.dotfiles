# default-type-parameters

**When:** A generic type has a common case that should work without explicit type arguments.

## Bad
```typescript
type Result<T, E> = { success: true; data: T } | { success: false; error: E };

// Must always specify both types
const result: Result<User, Error> = { success: true, data: user };
```

## Good
```typescript
type Result<T, E = Error> = { success: true; data: T } | { success: false; error: E };

// Error type defaults to Error
const result: Result<User> = { success: true, data: user };
// Can still override when needed
const custom: Result<User, CustomError> = { success: false, error: customErr };
```

## Why
Default type parameters reduce boilerplate for common cases while preserving flexibility. Place required parameters first, optional (defaulted) parameters last.
