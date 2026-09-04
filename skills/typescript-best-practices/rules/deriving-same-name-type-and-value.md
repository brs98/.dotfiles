# same-name-type-and-value

**When:** An API intentionally exposes a runtime value and its corresponding type under one name.

```typescript
const Logger = {
  format(message: string) { return `[log] ${message}`; },
};
type Logger = typeof Logger;
const logger: Logger = Logger;
```

TypeScript has separate type and value namespaces, so this is an optional naming pattern. It does not give a factory function class, `new`, or `instanceof` semantics. Names such as `createUser` for a factory and `User` for its result are also clear; do not rename them solely to enforce identical names.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/functions.html#construct-signatures); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/040-deriving-types-from-values/131-naming-values-and-types-the-same.explainer.1.ts). TypeScript 5.5+, strict mode; examples target ES2022.
