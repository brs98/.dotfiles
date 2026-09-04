# Describe synchronous non-returning helpers with never

**When:** A helper deliberately never returns normally, and callers need its control-flow contract.

```typescript
function fail(message: string): never {
  throw new Error(message);
}

function requireId(params: { id?: string }): string {
  return params.id ?? fail("Missing id");
}

async function rejectRequest(): Promise<never> {
  throw new Error("Request rejected");
}
```

An explicit `never` return on a synchronous throwing helper can support narrowing. The example uses `??` because an empty string is not nullish; use `||` only if empty IDs should also be rejected. An async helper returns a promise, so even `Promise<never>` does not terminate the caller synchronously. A generator returns an iterator before its body executes. Preserve intentionally wider base-method, overload, or public contracts rather than mechanically changing every throwing implementation to `never`.

For checking unhandled variants, use the separate [exhaustiveness pattern](narrowing-switch-statements.md).

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Handbook never](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#the-never-type), [Workshop throwing helper](https://github.com/total-typescript/pro-essentials-workshop/blob/main/src/018-unions-and-narrowing/068-returning-never-to-narrow.solution.1.ts).
