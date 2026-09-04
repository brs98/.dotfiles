# Rest parameter contracts

**When:** Typing a variable number of arguments.

Annotate an untyped rest parameter, or supply its type contextually. Use arrays for homogeneous arguments and tuples for positional contracts.

```typescript
function sum(...values: number[]) { return values.reduce((a, b) => a + b, 0); }
const contextual: (...values: number[]) => number = (...values) => sum(...values);
function pair(...args: [name: string, count: number]) { return args; }
```

Do not demand a redundant annotation when contextual typing already supplies it.

**Source:** [Rest parameter contracts](https://www.typescriptlang.org/docs/handbook/2/functions.html#rest-parameters). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
