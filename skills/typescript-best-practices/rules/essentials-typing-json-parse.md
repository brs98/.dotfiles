# Validate parsed data

**When:** Reading unchecked JSON or another external data boundary.

`JSON.parse` returns `any`. Contain it as `unknown`, then validate the data needed by the application.

```typescript
type User = { name: string };
function parseUser(json: string): User {
  const data: unknown = JSON.parse(json);
  if (typeof data !== "object" || data === null || !("name" in data) || typeof data.name !== "string") {
    throw new Error("Invalid user");
  }
  return { name: data.name };
}
```

Use a schema decoder for larger contracts. `JSON.parse(...) satisfies User` still has type `any`, so it does not contain unsafety. `as User` and a `User` variable annotation establish trusted compile-time contracts; neither validates runtime shape. They are appropriate only when an independently established guarantee justifies trusting that boundary. JSON syntax errors may still throw.

**Source:** [Validate parsed data](https://www.typescriptlang.org/docs/handbook/2/functions.html#unknown). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.

For unchecked external values, apply the canonical [unknown boundary and validation guidance](narrowing-unknown-boundaries.md); an ambient declaration only describes an assumed runtime value.
