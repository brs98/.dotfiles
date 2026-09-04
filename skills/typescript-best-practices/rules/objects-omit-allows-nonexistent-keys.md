# omit-allows-nonexistent-keys

**Compatibility reference:** See [StrictOmit](generics-strict-omit.md) for the canonical explanation, correct-key example and expected typo error.

Built-in `Omit` deliberately permits absent `PropertyKey` keys. Choose the stricter wrapper when every requested key should exist; it does not fix union distribution.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/utility-types.html#omittype-keys). TypeScript 5.5+, strict mode; examples target ES2022.
