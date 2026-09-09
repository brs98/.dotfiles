# Combine readonly literal inference with compatibility checking

**When:** A fixed literal should retain exact values, reject writes through its inferred type, and satisfy a target contract.

```typescript
const routes = {
  home: "/",
  about: "/about",
} as const satisfies Record<string, string>;

const home: "/" = routes.home;
// @ts-expect-error The inferred object contains only its known keys.
routes.typo;
// @ts-expect-error The inferred property is readonly.
routes.home = "/new";

// Mutable state can intentionally use satisfies without as const.
const state = { count: 0 } satisfies { count: number };
state.count++;
```

`as const satisfies Target` combines the two separate type-level effects. It does not validate runtime data or freeze values. Do not impose it on mutable state or public APIs that need wider types. See [const-assertion limits](safety-as-const-deep-readonly.md) and [satisfies tradeoffs](safety-satisfies-over-type-annotation.md).

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Workshop combined assertion](https://www.totaltypescript.com/workshops/typescript-pro-essentials/annotations-and-assertions/the-satisfies-keyword-and-deeply-read-only-objects-in-typescript/solution).
