# keyof-for-all-values

**When:** A type should include all property value types from a source object.

```typescript
const STATUS = { pending: "PENDING", success: "SUCCESS", error: "ERROR" } as const;
type Status = (typeof STATUS)[keyof typeof STATUS];
// "PENDING" | "SUCCESS" | "ERROR"
```

`Type[keyof Type]` forms the union of every property value type. `as const` preserves these literal string values. Use this when future properties should expand the union too. Methods, inherited properties and optional `undefined` also contribute when present in the source type; a hand-picked subset requires [explicit keys](deriving-union-indexed-access.md).

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/indexed-access-types.html); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/040-deriving-types-from-values/137-pass-keyof-into-an-indexed-access-type.solution.1.ts). TypeScript 5.5+, strict mode; examples target ES2022.
