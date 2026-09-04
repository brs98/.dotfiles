# awaited-for-async-returns

**When:** A consumer intentionally needs the resolved result of a particular async function.

```typescript
async function fetchUser() {
  return { id: "1", name: "Alice" };
}
type PendingUser = ReturnType<typeof fetchUser>; // Promise<{ id: string; name: string }>
type User = Awaited<ReturnType<typeof fetchUser>>; // { id: string; name: string }
```

`Awaited` models recursive await-style unwrapping of promises and compatible thenables. Preserve the promise type when modeling pending operations or promise caches. [ReturnType's overload/generic limits and coupling tradeoffs](deriving-returntype-for-function-returns.md) still apply.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/utility-types.html#awaitedtype); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/040-deriving-types-from-values/134-awaited-type-helper.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
