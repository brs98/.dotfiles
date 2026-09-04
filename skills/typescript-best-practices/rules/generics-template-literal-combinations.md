# template-literal-combinations

**When:** Every combination of small string literal sets is a meaningful value.

```typescript
type Size = "sm" | "md" | "lg";
type Color = "red" | "blue";
type ButtonClass = `${Size}-${Color}`;
// "sm-red" | "sm-blue" | "md-red" | "md-blue" | "lg-red" | "lg-blue"
```

Template literal types form a Cartesian product of interpolated unions. Use this when adding a size or color should add every combination. It is unsuitable for a manually restricted subset. Products grow rapidly; consider generating types ahead of time for large sets.

**Sources and version:** [TypeScript documentation](https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html). TypeScript 5.5+, strict mode; examples target ES2022.
