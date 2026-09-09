# Prefer const for unchanged bindings

**When:** A binding has an initializer and is never reassigned. Keep `let` for writes, including destructuring assignments and loop assignments.

```typescript
const requestStatus = "pending"; // Literal type "pending"
const count = 0;                 // Literal type 0

let attempts = 0;
attempts += 1;
let first = 0;
[first] = [1]; // Also a reassignment.

const state = { count: 0 };
state.count++; // const protects the binding, not the object's properties.
```

Primitive const initializers normally retain literal types. An explicit wider annotation may still be intentional; preserve observable API and type-query contracts when changing a declaration. Do not replace uninitialized `let` declarations mechanically with `const`. [Object readonly](safety-as-const-deep-readonly.md) is a separate decision.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Handbook literal inference](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-inference).
