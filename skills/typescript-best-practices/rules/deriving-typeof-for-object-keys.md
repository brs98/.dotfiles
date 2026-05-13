# typeof-for-object-keys

**When:** You need a union type of keys from a runtime object or constant.

## Bad
```typescript
const routes = { home: "/", about: "/about", contact: "/contact" };
type Route = "home" | "about" | "contact"; // Manual, can drift
```

## Good
```typescript
const routes = { home: "/", about: "/about", contact: "/contact" } as const;
type Route = keyof typeof routes; // "home" | "about" | "contact"
```

## Why
`keyof typeof` derives a union of keys directly from a runtime value. Combined with `as const`, the type stays in sync with the actual object - add a key to the object and the type updates automatically.
