# union-for-shared-properties

**When:** Writing a function that only needs properties common to multiple types.

## Bad
```typescript
type User = { id: string; name: string };
type Product = { id: string; price: number };

function getId(item: User | Product) {
  return item.name; // Error: name doesn't exist on Product
}
```

## Good
```typescript
type User = { id: string; name: string };
type Product = { id: string; price: number };

function getId(item: User | Product) {
  return item.id; // OK: id exists on both types
}
```

## Why
Union types only allow access to properties that exist on ALL members. This is type-safe behavior - you can only use what's guaranteed to exist regardless of which variant you receive.
