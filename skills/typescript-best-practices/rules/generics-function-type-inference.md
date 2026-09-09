# function-type-inference

**When:** A generic call can infer the intended type from its arguments.

```typescript
function first<T>(arr: readonly T[]): T | undefined {
  return arr[0];
}
const item = first(["a", "b"]); // string | undefined
const num = first([1, 2, 3]); // number | undefined
const optional = first<string | undefined>(["a"]);
```

Omit type arguments when inference gives the intended contract. Explicit arguments can deliberately widen a literal, select a compatible overload, or supply a type absent from the inputs. Verify the resulting type before removing them; an inferred call is not automatically equivalent.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/functions.html#generic-functions). TypeScript 5.5+, strict mode; examples target ES2022.
