# returntype-for-function-returns

**When:** A consumer's type should change with the result of a specific function.

```typescript
function createUser(id: string) {
  return { id, createdAt: new Date() };
}
type CreatedUser = ReturnType<typeof createUser>;
// { id: string; createdAt: Date }
```

Derivation is useful when both declarations represent the same concern. An explicit public or domain contract can instead govern the implementation, and should not automatically follow every inferred change. Matching structures alone do not justify replacing an independent type with `ReturnType`.

For overloaded functions, `ReturnType` uses the last overload signature. Generic return types may become `unknown`, so it does not reproduce every invocation's inference. Avoid deriving an annotation from the function that already uses that annotation; this creates a circular dependency.

See [deriving versus decoupling](https://www.totaltypescript.com/books/total-typescript-essentials/deriving-types#deriving-vs-decoupling).

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/utility-types.html#returntypetype). TypeScript 5.5+, strict mode; examples target ES2022.
