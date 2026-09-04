# union-from-array

**When:** A type should exactly track all elements of a constant array.

```typescript
const ROLES = ["admin", "user", "guest"] as const;
type Role = (typeof ROLES)[number]; // "admin" | "user" | "guest"
```

Indexed access with `number` extracts the union of element types. For this otherwise widening array literal, `as const` is the straightforward way to preserve the literals; an explicit tuple or other literal-preserving typing can also work. Do not replace a narrower allowed subset with the entire array's union, or couple independently evolving contracts merely because their current members match.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/040-deriving-types-from-values/138-create-a-union-from-an-as-const-array.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
