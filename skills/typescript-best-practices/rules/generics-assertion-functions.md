# assertion-functions

**When:** A validator throws unless a fact holds, and callers need that fact for narrowing.

```typescript
function assertNumber(value: unknown): asserts value is number {
  if (typeof value !== "number") throw new Error("Not a number");
}
const input: unknown = 42;
assertNumber(input);
input.toFixed(2);

function assert(condition: unknown): asserts condition {
  if (!condition) throw new Error("Assertion failed");
}
```

TypeScript trusts the assertion contract; it does not prove the implementation establishes it. Test the validator's accepted and rejected inputs. Narrowing applies after successful return and can change after reassignment. Throwing alone does not imply a particular asserted type.

Prefer function declarations for assertion helpers. An assertion assigned to a variable needs an explicit callable annotation on that variable to be usable for narrowing (TS2775).

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-7.html#assertion-functions); [Pro Essentials course source](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/085-the-utils-folder/222-assertion-functions.solution.ts). TypeScript 5.5+, strict mode; examples target ES2022.
