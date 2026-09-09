# Narrow the actual caught value before using it

**When:** Reading properties from a catch variable. JavaScript permits throwing any value.

With `strict` or `useUnknownInCatchVariables` enabled:

```typescript
const input = "not JSON";
try {
  JSON.parse(input);
} catch (error) {
  if (error instanceof SyntaxError) {
    console.error(error.message);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error("Non-Error thrown value", error);
  }
}
```

Implicit catch variables are `unknown` with that option and can default to `any` without it. An explicit catch annotation can be `unknown` or `any`, not a particular error subclass.

Use control-flow evidence at each access. A check somewhere else in the catch block does not protect an access outside its narrowed branch. Appropriate type predicates/assertion functions, `typeof` and property checks can also validate non-Error thrown values; `instanceof Error` is not the only valid guard.

**Validation:** Compiler examples checked with TypeScript 5.9.2; strict checking unless stated otherwise.

**Source:** [TypeScript useUnknownInCatchVariables](https://www.typescriptlang.org/tsconfig/useUnknownInCatchVariables.html)
