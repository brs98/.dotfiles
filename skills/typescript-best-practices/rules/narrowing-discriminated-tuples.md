# Relate tuple slots with a discriminant

**When:** A tuple represents alternative states and one position determines another position's type.

```typescript
type User = { name: string };
type ApiResponse = readonly ["success", User[]] | readonly ["error", string];

async function fetchData(): Promise<ApiResponse> {
  return ["success", [{ name: "Ada" }]];
}

async function displayUsers() {
  const [status, value] = await fetchData();
  if (status === "success") {
    return value.map(user => user.name).join(", ");
  }
  return value.toUpperCase(); // string in the error variant
}

// A tag need not occupy the first position.
type Result = [number, "ok"] | [string, "error"];
function format(result: Result) {
  return result[1] === "ok" ? result[0].toFixed(2) : result[0].toUpperCase();
}
```

Use disjoint literal tags at a shared position when that model fits the data. Distinct tuple lengths can also discriminate variants; positional overload tuples need not gain artificial tags. Supported const destructuring preserves the relationship. Choose [readonly tuple contracts](safety-readonly-tuples.md) separately from choosing the discriminant.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Workshop discriminated tuples](https://www.totaltypescript.com/workshops/typescript-pro-essentials/unions-and-narrowing/refining-types-with-discriminated-unions-of-tuples/solution), [TS dependent parameter analysis](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-6.html#control-flow-analysis-for-dependent-parameters).
