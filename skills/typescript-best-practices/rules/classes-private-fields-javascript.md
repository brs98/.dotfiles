# private-fields-javascript

**When:** You need truly private class members that can't be accessed externally.

## Bad
```typescript
class User {
  private password: string; // TypeScript-only, accessible at runtime
  constructor(password: string) {
    this.password = password;
  }
}
const user = new User("secret");
(user as any).password; // "secret" - accessible!
```

## Good
```typescript
class User {
  #password: string; // JavaScript private field - truly private
  constructor(password: string) {
    this.#password = password;
  }
}
const user = new User("secret");
(user as any).#password; // SyntaxError - cannot access
```

## Why
TypeScript's `private` keyword is compile-time only and can be bypassed with `any`. JavaScript's `#` private fields provide true runtime privacy that cannot be accessed from outside the class.
