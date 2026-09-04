# Runtime private fields

**When:** A field must have JavaScript private-name enforcement.

`#` fields enforce access at runtime; TypeScript `private` primarily restricts checked source access. Use the mechanism matching the required contract and supported target.

```typescript
class Vault {
  #password: string;
  constructor(password: string) { this.#password = password; }
  matches(candidate: string) { return candidate === this.#password; }
}
const vault = new Vault("example");
vault.matches("example");
```

Accessing `vault.#password` outside the class is a syntax/compile error; it is deliberately excluded from runnable code. Private names do not prevent a class from exposing values through public methods. Changing `private` to `#` changes reflection, interoperability, and subclass behavior; it is not a mechanical refactor.

**Source:** [Runtime private fields](https://www.typescriptlang.org/docs/handbook/2/classes.html#caveats). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
