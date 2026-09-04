# Verify the invariant behind non-null assertions

**When:** `!` removes null or undefined from a value's static type.

```typescript
function printItems(items: readonly string[] | undefined) {
  if (items === undefined) return;
  items.forEach(item => console.log(item));
}

function activateApp() {
  const element = document.getElementById("app");
  if (element === null) throw new Error("App element not found");
  element.classList.add("active");
}
```

Prefer a check when absence is possible; choose throwing, returning, or a fallback according to the application. A non-null assertion performs no runtime validation and can hide a real missing value. An independently guaranteed invariant that TypeScript cannot express can justify one, so treat assertions as review points rather than a universal ban. Avoid replacing `!` with another assertion that merely conceals the same uncertainty.

**Checked:** TypeScript 5.9.2 with `strict` and `noUncheckedIndexedAccess` (ES2022 + DOM).
**Sources:** [Workshop non-null assertions](https://www.totaltypescript.com/workshops/typescript-pro-essentials/annotations-and-assertions/non-null-assertions/solution).
