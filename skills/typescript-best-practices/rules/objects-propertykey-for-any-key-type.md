# propertykey-for-any-key-type

**When:** An operation accepts arbitrary JavaScript property keys rather than only keys known on a specific object type.

```typescript
function hasOwnKey(obj: object, key: PropertyKey): boolean {
  return Object.hasOwn(obj, key);
}
hasOwnKey({ name: "Alice" }, "name");
hasOwnKey({ 0: "first" }, 0);
hasOwnKey({}, Symbol("tag"));
```

`PropertyKey` is the built-in alias for `string | number | symbol`; using the alias is a readability choice. Number keys are supported by JavaScript's property-access syntax and coerce to string property names.

Existence checks do not prove that a key is in an object's statically declared `keyof` set: runtime objects can have extra properties. In particular, `keyof object` is `never`, so a predicate `key is keyof typeof obj` with `obj: object` is wrong. Use a boolean existence check here and [a constrained key](generics-function-constraints.md) when safe typed indexing is the contract. For runtimes before ES2022, use `Object.prototype.hasOwnProperty.call(obj, key)`.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-9.html#support-number-and-symbol-named-properties-with-keyof-and-mapped-types); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/020-objects/086-property-key-type.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
