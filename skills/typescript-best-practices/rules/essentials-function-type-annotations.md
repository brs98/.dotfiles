# Function contracts

**When:** Typing a callback or exported callable contract.

Describe the arguments and result rather than using the broad `Function` type.

```typescript
type User = { name: string };
type FormatUser = (user: User) => string;
const format: FormatUser = user => user.name;
const callbacks: Array<() => void> = [];
const addCallback: () => void = () => callbacks.push(() => {});
```

A contextual `() => void` contract means the caller ignores the result; the implementation may return a value, as `push` does here. A function explicitly declared `function f(): void` cannot return a number. Parameter annotations can be inferred from a contextual callback type.

**Source:** [Function contracts](https://www.typescriptlang.org/docs/handbook/2/functions.html#return-type-void). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
