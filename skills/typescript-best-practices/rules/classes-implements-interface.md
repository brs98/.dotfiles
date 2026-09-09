# Explicit class contracts

**When:** A class is intended to implement a particular interface.

`implements` checks the class against its intended contract at its declaration.

```typescript
interface Logger { log(message: string): void }
// @ts-expect-error The intended log method is missing.
class BrokenLogger implements Logger {
  logg(message: string) { console.log(message); }
}
class ConsoleLogger implements Logger {
  log(message: string) { console.log(message); }
  flush() {} // Extra members are permitted.
}
```

Without `implements`, structural assignments and calls still check compatibility. Adding `implements` does not infer parameter types for methods, and does not reject an extra `logg` method if the required `log` is also present.

**Source:** [Explicit class contracts](https://www.typescriptlang.org/docs/handbook/2/classes.html#implements-clauses). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
