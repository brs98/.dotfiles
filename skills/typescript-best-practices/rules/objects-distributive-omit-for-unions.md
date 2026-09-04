# distributive-omit-for-unions

**When:** Omitting keys from each union member must preserve its remaining variant-specific properties.

```typescript
type Entity = { type: "user"; name: string } | { type: "product"; price: number };
type WithoutType = Omit<Entity, "type">; // {}

type DistributiveOmit<T, K extends PropertyKey> =
  T extends unknown ? Omit<T, K> : never;
type VariantDetails = DistributiveOmit<Entity, "type">;
// { name: string } | { price: number }
```

`keyof Entity` is only `"type"`; ordinary `Omit` operates on those shared keys, so removing `"type"` yields `{}`. This is not an object with optional `name` and `price`, nor an exact empty-object type.

A conditional over the naked type parameter distributes the operation across members. Use it when preserving variant structure is intended. Omitting a discriminant also removes that narrowing mechanism. For rejecting nonexistent keys on a known type, see [StrictOmit](generics-strict-omit.md); that is a separate concern.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#distributive-conditional-types); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/020-objects/093-omit-cant-distribute.explainer.2.ts). TypeScript 5.5+, strict mode; examples target ES2022.
