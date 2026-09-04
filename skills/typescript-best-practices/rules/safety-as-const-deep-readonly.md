# Readonly literal expressions with as const

**When:** A literal should retain its exact values and reject writes through its inferred type. This is an optional contract choice; mutable application state should remain mutable.

```typescript
const colors = { primary: "#007bff", secondary: "#6c757d" } as const;
const primary: "#007bff" = colors.primary;
// @ts-expect-error The inferred property is readonly.
colors.primary = "#000";

const items = [1];
const config = { items, nested: { enabled: true } } as const;
config.items.push(2); // Referenced mutable arrays stay mutable.
// @ts-expect-error Properties of this nested literal are readonly.
config.nested.enabled = false;
```

`as const` gives the literal expression readonly properties/tuples and literal types. It does not recursively transform existing referenced values, validate data, or freeze anything at runtime. Runtime protection is a separate choice: see [freezing versus const assertions](safety-as-const-over-object-freeze.md). Const assertions require a supported literal expression; an arbitrary variable cannot simply be followed by `as const`.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [TS 3.4 const-assertion caveats](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-4.html#caveats).
