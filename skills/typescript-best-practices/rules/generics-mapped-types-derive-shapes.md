# mapped-types-derive-shapes

**When:** Every property should undergo the same transformation and both shapes should evolve together.

```typescript
type User = { name: string; age: number };
type Getters<T> = {
  [K in keyof T]: () => T[K];
};
type UserGetters = Getters<User>;
// { name: () => string; age: () => number }
```

Mapped types iterate over keys and derive property values. This homomorphic form preserves existing optional and readonly modifiers; use explicit mapping modifiers when changing those is intended. Avoid coupling unrelated models merely because their current shapes look similar. For renamed or filtered keys, see [key remapping](generics-remap-keys-with-as.md).

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/083-designing-your-types/212-mapped-types.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
