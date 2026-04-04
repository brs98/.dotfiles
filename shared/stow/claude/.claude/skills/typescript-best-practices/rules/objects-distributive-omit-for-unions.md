# distributive-omit-for-unions

**When:** Using Omit or Pick on a union of object types.

## Bad
```typescript
type Entity = { type: "user"; name: string } | { type: "product"; price: number };
type WithoutType = Omit<Entity, "type">;
// Result: { name?: string; price?: number } - collapsed, not distributed!
```

## Good
```typescript
type DistributiveOmit<T, K extends PropertyKey> = T extends any
  ? Omit<T, K>
  : never;

type Entity = { type: "user"; name: string } | { type: "product"; price: number };
type WithoutType = DistributiveOmit<Entity, "type">;
// Result: { name: string } | { price: number } - properly distributed
```

## Why
Standard Omit/Pick collapse unions into a single object type. Use the distributive pattern (`T extends any ? ... : never`) to apply the operation to each union member separately.
