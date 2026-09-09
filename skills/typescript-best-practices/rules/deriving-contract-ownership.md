# Derive or keep independent contracts

**When:** Deciding whether a type should follow an implementation or another model.

Derive when changes should propagate; declare a separate contract when the boundary must constrain implementation changes.

```typescript
const routes = ["home", "account"] as const;
type Route = (typeof routes)[number]; // intentionally tracks the registry
interface PublicResult { id: string }
function internalResult(): PublicResult { return { id: "example" }; }
```

Before replacing a handwritten union, require exact membership: a subset may be an intentional authorization or feature boundary. Before introducing `typeof`, verify symbol visibility and initialization independence. `ReturnType` and `Parameters` can lose generic relationships or expose the final overload signature; retain an explicit public contract where that distinction matters.

Check dependencies in both directions: deriving `Value` from `values` is circular if `values` is already annotated as `readonly Value[]`. The same problem occurs with `Record<Key, ...>` and object properties that reference the alias being replaced, including through another alias. Choose which declaration owns the contract before introducing derivation.

For a concrete replacement, compile the resulting code in its project and check the relevant contract: allowed keys and values, writable properties, argument slots, and return types. Compilation alone does not establish equivalence. If those properties cannot be established, keep the existing declaration or explain the intended contract change explicitly.

**Source:** [Derive or keep independent contracts](https://www.typescriptlang.org/docs/handbook/utility-types.html). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
