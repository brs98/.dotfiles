# Choose static readonly or runtime freezing

**When:** Deciding which protection a constant needs. Preserve runtime freezing when callers rely on it.

```typescript
const flat = Object.freeze({ api: "/api", version: 1 });
const api: "/api" = flat.api; // Flat Object.freeze preserves these literals.

const shallow = Object.freeze({ service: { path: "/api" } });
shallow.service.path = "/v2"; // Nested object is still mutable.

const literal = { service: { path: "/api" } } as const;
// @ts-expect-error A property in the literal is readonly statically.
literal.service.path = "/v2";

const both = Object.freeze({ service: { path: "/api" } } as const);
Object.isFrozen(both);         // true: runtime freeze of the outer object
Object.isFrozen(both.service); // false: nested literal is only readonly statically
```

`Object.freeze` applies shallow runtime protection. `as const` is erased and changes inferred types; it is not a runtime replacement. Combining them does not deep-freeze nested objects. Use a separate deep-freeze implementation if that runtime invariant is actually required. For referenced objects and assertion restrictions, see [const-assertion limits](safety-as-const-deep-readonly.md).

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Workshop freeze comparison](https://www.totaltypescript.com/workshops/typescript-pro-essentials/mutability/comparing-object.freeze-with-as-const/solution), [TS const-assertion caveats](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#caveats).
