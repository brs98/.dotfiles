# Guard nullable values before dereferencing

**When:** A value may be absent at a property access. Throwing is appropriate only when absence is an error for the application.

```typescript
function activateApp() {
  const appElement = document.getElementById("app");
  if (appElement === null) throw new Error("App element not found");
  appElement.textContent = "Hello"; // HTMLElement after the terminating guard
}

function greet(user: { name: string } | null): string {
  if (user === null) return "Guest";
  return user.name;
}

function optionalName(user: { name: string } | null): string | undefined {
  return user?.name;
}
```

TypeScript follows reachable control flow, including early returns, throws, logical guards, and correctly declared assertion helpers. Check the flow type at the use. An unrelated null check, optional chain elsewhere, or explicit annotation cannot establish that the current access is safe. Choose the missing-value behavior deliberately rather than inserting a throw solely to satisfy a rule.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Handbook control-flow analysis](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#control-flow-analysis).
