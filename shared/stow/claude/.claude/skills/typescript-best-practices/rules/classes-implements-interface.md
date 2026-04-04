# implements-interface

**When:** You want to ensure a class adheres to a specific contract.

## Bad
```typescript
interface Logger {
  log(message: string): void;
}

class ConsoleLogger {
  log(msg: string) { console.log(msg); } // No enforcement
  logg(msg: string) { } // Typo goes unnoticed
}
```

## Good
```typescript
interface Logger {
  log(message: string): void;
}

class ConsoleLogger implements Logger {
  log(message: string) { console.log(message); }
  // Missing or misspelled methods cause compile errors
}
```

## Why
`implements` enforces that a class has all required properties and methods from an interface. Without it, typos and missing methods aren't caught until runtime.
