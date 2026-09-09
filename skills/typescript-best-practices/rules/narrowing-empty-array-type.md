# Contextualize empty arrays when never[] blocks intended writes

**When:** An uncontextualized empty array property is inferred as `never[]` and should accept elements.

```typescript
const untypedCart = { items: [] };
// @ts-expect-error This uncontextualized property is inferred as never[].
untypedCart.items.push("Apple");

type ShoppingCart = { items: string[] };
const cart: ShoppingCart = { items: [] };
cart.items.push("Apple");

// Standalone empty arrays can evolve under strict inference.
const collected = [];
collected.push("Apple");
const first: string | undefined = collected[0];
```

Provide the intended contextual type or an annotation where the array is defined. Do not assume every empty literal infers `never[]`: standalone evolving arrays, contextually typed arguments/properties, and compiler settings affect inference. `[] satisfies string[]` checks compatibility but does not necessarily supply the wider mutable contract needed later. An explicit `never[]` or empty readonly tuple can also be intentional.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Workshop never-array solution](https://www.totaltypescript.com/workshops/typescript-pro-essentials/unions-and-narrowing/solving-the-never-type-in-typescript/solution), [TS 2.1 evolving array inference](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-1.html#improved-any-inference).
