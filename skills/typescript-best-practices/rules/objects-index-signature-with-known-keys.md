# index-signature-with-known-keys

**When:** An object has required named properties and permits arbitrary additional keys.

```typescript
type Scores = {
  math: number;
  english: number;
  [key: string]: number;
};
const scores: Scores = { math: 90, english: 85, science: 88 };
// @ts-expect-error english is required.
const incomplete: Scores = { math: 90 };
```

Explicit properties enforce the required keys; the index signature permits additional keys. Named property types must be assignable to the signature's value type, not necessarily identical to it. Enable `noUncheckedIndexedAccess` to include `undefined` when reading potentially absent dynamic keys. Do not invent required keys for an intentionally open dictionary.

A string index signature and `Record<string, T>` are not interchangeable in every type operation: their `keyof` types differ. Treat a conversion as an intentional contract change, preserve generic parameters and readonly, and account for interface declaration merging. See the [keyof documentation](https://www.typescriptlang.org/docs/handbook/2/keyof-types.html).

```typescript
type Indexed<T> = { [key: string]: T };
type Recorded<T> = Record<string, T>;
const numericKey: keyof Indexed<number> = 0; // string | number
// @ts-expect-error keyof Record<string, number> is string.
const changedKey: keyof Recorded<number> = 0;
```

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/objects.html#index-signatures); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/020-objects/085-index-signatures-with-defined-keys.solution.1.ts). TypeScript 5.5+, strict mode; examples target ES2022.
