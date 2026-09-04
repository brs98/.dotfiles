# Shared type aliases

**When:** Repeated shapes represent one domain concept that should evolve together.

An alias can keep a shared contract consistent.

```typescript
type Rectangle = { width: number; height: number };
function area(rectangle: Rectangle) { return rectangle.width * rectangle.height; }
function perimeter(rectangle: Rectangle) { return 2 * (rectangle.width + rectangle.height); }
```

Structurally identical transport, domain, and UI models may have independent ownership. Keep those contracts separate when changes should not propagate automatically.

**Source:** [Shared type aliases](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-aliases). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
