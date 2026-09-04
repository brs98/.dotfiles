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

**Source:** [Derive or keep independent contracts](https://www.typescriptlang.org/docs/handbook/utility-types.html). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
