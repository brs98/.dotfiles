# Use parameter properties only when their emit is supported

**When:** A constructor stores parameters as instance fields and shorthand matches the intended initialization and public contract.

Explicit fields work with erasable TypeScript syntax:

```typescript
class CanvasNode {
  private x: number;
  private y: number;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}
```

When the configured transpiler supports parameter-property transforms, this is an optional alternative:

```typescript
class CanvasNode {
  constructor(private x: number, private y: number) {}
}
```

The second block is rejected by `erasableSyntaxOnly` (TypeScript 5.8+) and by native Node type stripping. Do not recommend it for that runtime. Retain explicit assignments when order, parameter transformations, accessors, decorators or field initialization can observe a difference. Preserve `private`/`protected`/`public`, `readonly`, optionality and the instance contract when comparing forms. Neither style is a universal correctness improvement.

**Validation:** Both alternatives checked separately with TypeScript 5.9.2; explicit fields pass erasableSyntaxOnly and parameter properties produce expected TS1294.

**Source:** [TypeScript erasableSyntaxOnly](https://www.typescriptlang.org/tsconfig/erasableSyntaxOnly.html), [workshop TS feature comparison](https://github.com/total-typescript/pro-essentials-workshop/blob/7491e6c5ed45dfcb3593289397e3a68244898128/src/032-typescript-only-features/124-prefer-es-features-to-ts-features.explainer/index.ts)
