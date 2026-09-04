# avoid-duplicate-interfaces

**When:** Multiple declarations of one interface in the same scope unintentionally combine requirements.

```typescript
interface User { name: string }
interface User { email: string }
// @ts-expect-error The merged interface requires email too.
const incomplete: User = { name: "Alice" };
const user: User = { name: "Alice", email: "alice@example.com" };
```

Consolidate accidental duplicates into one declaration, or choose a type alias if reopening is not part of the design. Interfaces with the same name in separate modules do not automatically merge. Intentional declaration merging and module/global augmentation are valid uses of interfaces.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/declaration-merging.html); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/020-objects/088-declaration-merging-of-interfaces.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
