# Infer obvious locals; annotate intended contracts

**When:** Choosing between an inferred local type and an explicit contract. An annotation is not redundant merely because inference succeeds.

```typescript
const displayName = "Alice"; // Literal type "Alice"
const count = 42;            // Literal type 42
const items = ["a", "b"];   // Mutable string[]

// Deliberate widening can be part of an API or a derived type.
export const DEFAULT_LABEL: string = "Untitled";
const customLabel: typeof DEFAULT_LABEL = "Notes";

// A declared return contract catches accidental implementation drift.
function makeLabel(id: number): string {
  return `Item ${id}`;
}
```

Use inference when it expresses the intended local contract clearly. Use annotations for public boundaries, contextual callback types, implementation checks, or deliberate widening. Removing `: string` from the exported constant changes `typeof DEFAULT_LABEL`, so it is a type-contract change rather than a pure formatting cleanup. See [satisfies tradeoffs](safety-satisfies-over-type-annotation.md).

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Workshop annotations and satisfies](https://www.totaltypescript.com/workshops/typescript-pro-essentials/annotations-and-assertions/comparing-as-satisfies-and-variable-annotations-in-typescript/solution), [Handbook return annotations](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#return-type-annotations).
