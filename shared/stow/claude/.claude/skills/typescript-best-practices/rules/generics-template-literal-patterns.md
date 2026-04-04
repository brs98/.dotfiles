# template-literal-patterns

**When:** You need to enforce string patterns at the type level.

## Bad
```typescript
function navigate(route: string) {
  // No guarantee route starts with "/"
}
navigate("users"); // Should error but doesn't
```

## Good
```typescript
type Route = `/${string}`;

function navigate(route: Route) {
  // route guaranteed to start with "/"
}
navigate("/users"); // OK
navigate("users"); // Error: doesn't match pattern
```

## Why
Template literal types can enforce string patterns. Use `${string}` for any string, `${number}` for numeric strings, or specific unions for constrained patterns.
