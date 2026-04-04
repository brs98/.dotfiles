# avoid-namespaces

**When:** Organizing code or types in application code.

## Bad
```typescript
namespace GeometryUtils {
  export function calculateArea(radius: number) {
    return Math.PI * radius ** 2;
  }
}
```

## Good
```typescript
// Use ES modules instead
export function calculateArea(radius: number) {
  return Math.PI * radius ** 2;
}
```

## Why
Namespaces predate ES modules and solve the same problem of avoiding naming conflicts. ES modules are the JavaScript standard, work with all build tools, and provide better tree-shaking.
