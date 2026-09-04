# remap-keys-with-as

**When:** A derived shape intentionally renames or filters source keys.

```typescript
type Events = { click: () => void; hover: () => void };
type WithOnPrefix<T> = {
  [K in keyof T as `on${Capitalize<string & K>}`]: T[K];
};
type EventHandlers = WithOnPrefix<Events>;
// { onClick: () => void; onHover: () => void }

type WithoutId<T> = {
  [K in keyof T as K extends "id" ? never : K]: T[K];
};
type Details = WithoutId<{ id: string; name: string }>;
// { name: string }
```

The `as` clause remaps keys; producing `never` removes a key. `string & K` keeps only string keys, dropping numeric and symbol keys. Decide whether that loss is intended. Preserve property types and optional/readonly modifiers when replacing a manually declared shape; matching names alone does not establish equivalence.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html#key-remapping-via-as); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/083-designing-your-types/213-as-in-mapped-types.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
