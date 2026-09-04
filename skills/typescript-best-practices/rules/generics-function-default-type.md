# function-default-type

**When:** A generic function has a useful common type when neither arguments nor context provide an inference candidate.

```typescript
function createStringMap<T = string>() {
  return new Map<string, T>();
}
const labels = createStringMap();
labels.set("save", "Save");
// @ts-expect-error The default value type is string.
labels.set("count", 1);

const counts = createStringMap<number>();
counts.set("count", 1);
```

A default is a fallback; inference or an explicit type argument can select another type. Choose it from the API's actual common case. An unconstrained, uninferred parameter already falls back to `unknown`, so adding `= unknown` alone does not make that case more useful.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/generics.html#generic-parameter-defaults); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/085-the-utils-folder/216-type-parameter-defaults-in-generic-functions.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
