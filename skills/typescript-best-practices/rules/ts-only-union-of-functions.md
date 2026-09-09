# Call function unions with arguments accepted by every possible member

**When:** A value may hold one of several callable implementations.

```typescript
const logId = (obj: { id: string }) => console.log(obj.id);
const logName = (obj: { name: string }) => console.log(obj.name);
const loggers = [logId, logName];
// @ts-expect-error The selected implementation might need name.
loggers.forEach((func) => func({ id: "1" }));
loggers.forEach((func) => func({ id: "1", name: "Ada" }));
```

For this ordinary union, a call needs the intersection of parameter requirements; return values form a union. Different parameter types can still overlap, so they do not automatically produce `never`. Conflicts can occur in later parameters too. Overloaded/generic signatures introduce further call-signature constraints.

A union describes **either** implementation. Overloads or a single union-parameter function describe a function supporting multiple cases, so they are not equivalent repairs. Supply all required fields, narrow/select the implementation, or retain correlated arguments as appropriate. Do not broaden each independent logger's input contract solely to make a collection easier to call.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript callable unions](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-3.html#improved-behavior-for-calling-union-types), [workshop callable object unions](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/050-the-weird-parts/156-unions-of-functions-with-object-params.solution.ts)
