# as-const-over-object-freeze

**When:** You want an immutable object with TypeScript enforcement.

## Bad
```typescript
const config = Object.freeze({ api: "/api", version: 1 });
// type: Readonly<{ api: string; version: number }> - literals lost
// Only shallow freeze at runtime
```

## Good
```typescript
const config = { api: "/api", version: 1 } as const;
// type: { readonly api: "/api"; readonly version: 1 } - literals preserved
// Deep readonly at compile time
```

## Why
`as const` provides deep readonly with literal types at compile time. `Object.freeze` is shallow, has runtime overhead, and loses literal type information.
