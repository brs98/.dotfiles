# interface-extends-over-intersections

**When:** Combining object types to create extended types with shared properties.

## Bad
```typescript
type User = { id: string; name: string };
type Admin = User & { permissions: string[] };
// Intersections are recomputed on every use
```

## Good
```typescript
interface User { id: string; name: string }
interface Admin extends User { permissions: string[] }
// Interfaces are cached and more performant
```

## Why
TypeScript caches interface relationships but recomputes intersection types on every use. For complex type hierarchies, `interface extends` provides better IDE performance and clearer error messages.
