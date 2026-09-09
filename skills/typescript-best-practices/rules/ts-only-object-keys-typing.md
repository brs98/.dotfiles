# Preserve the distinction between runtime keys and static keys

**When:** Iterating `Object.keys(value)` and indexing back into a closed static type.

```typescript
const user = { name: "Alice", age: 30 };
for (const key of Object.keys(user)) {
  // @ts-expect-error key is string, not a proven key of this object type.
  console.log(user[key]);
}
```

If only the key/value pairs are needed, iterate entries:

```typescript
const user = { name: "Alice", age: 30 };
for (const [key, value] of Object.entries(user)) {
  console.log(key, value);
}
```

If a known subset is intended, use an explicit checked key list:

```typescript
const user = { name: "Alice", age: 30 };
const keys = ["name", "age"] as const satisfies readonly (keyof typeof user)[];
for (const key of keys) console.log(user[key]);
```

Runtime objects can contain extra or inherited properties absent from their static type. A generic predicate claiming `key is keyof T` from `key in obj` is therefore unsound; `Object.hasOwn` alone does not fix the extra-key problem. Do not use such a helper as general proof.

An assertion from `Object.keys` to static keys is a trusted shortcut only when a closed local object's exact enumerable string keys are established and preserved. It is not justified for arbitrary structurally typed values; remember that `Object.keys` omits symbols and returns numeric keys as strings. A declared string index signature can already make string indexing valid.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript structural compatibility](https://www.typescriptlang.org/docs/handbook/type-compatibility.html), [workshop iteration examples](https://github.com/total-typescript/pro-essentials-workshop/tree/7491e6c5ed45dfcb3593289397e3a68244898128/src/050-the-weird-parts)
