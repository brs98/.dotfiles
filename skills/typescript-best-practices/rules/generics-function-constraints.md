# function-constraints

**When:** A function relates an object's keys to its property value types.

```typescript
function pluck<T, K extends keyof T>(items: readonly T[], key: K): T[K][] {
  return items.map(item => item[key]);
}
const users = [{ name: "Alice", age: 30 }];
const names = pluck(users, "name"); // string[]
const ages = pluck(users, "age"); // number[]
// @ts-expect-error The input objects have no such key.
pluck(users, "invalid");
```

`K extends keyof T` preserves the relationship between the key and result. A broad `string` or `PropertyKey` cannot safely index an arbitrary `T`. Read-only input accepts mutable and readonly arrays because this operation does not mutate them.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/generics.html#using-type-parameters-in-generic-constraints). TypeScript 5.5+, strict mode; examples target ES2022.
