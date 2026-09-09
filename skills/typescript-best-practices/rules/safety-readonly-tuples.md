# Make tuple mutability intentional

**When:** Fixed-position values should be read without changing their indexed slots or length. Mutable tuple APIs remain valid.

```typescript
type Point = readonly [number, number];
function distance(point: Point): number {
  return Math.sqrt(point[0] ** 2 + point[1] ** 2);
}

function accidentalWrite(point: Point) {
  // @ts-expect-error A readonly tuple rejects indexed writes.
  point[0] = 0;
  // @ts-expect-error A readonly tuple has no pop method.
  point.pop();
}

const pairs: readonly [string, number][] = [["a", 1]];
const first = pairs[0];
if (first) first[0] = "b"; // Outer readonly array; tuple elements are mutable.

const fullyReadonly: readonly (readonly [string, number])[] = [["a", 1]];
```

Apply readonly at the tuple's own level when its slots should not change. `ReadonlyArray<[A, B]>` and `Readonly<[A, B][]>` also leave their tuple elements mutable. Do not add readonly mechanically to conditional-type tuple patterns, generic constraints, or contracts that intentionally accept mutable tuples.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Workshop unsafe tuples](https://www.totaltypescript.com/workshops/typescript-pro-essentials/mutability/fixing-unsafe-tuples/solution), [Handbook tuple types](https://www.typescriptlang.org/docs/handbook/2/objects.html#tuple-types).
