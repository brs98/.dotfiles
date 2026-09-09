# Accessors and methods

**When:** An operation naturally represents property-like access.

Use a getter for property semantics; a method is equally valid when the API describes an operation.

```typescript
class Rectangle {
  width = 2;
  height = 3;
  get area() { return this.width * this.height; }
  calculateArea() { return this.width * this.height; }
}
```

Setters can validate assignments, but converting `setX(value)` to `set x(value)` changes caller syntax and interface contracts. Keep async operations and methods with meaningful return values as methods; setters cannot be async and cannot return values. Initialize fields so unrelated definite-assignment errors do not obscure the API choice.

**Source:** [Accessors and methods](https://www.typescriptlang.org/docs/handbook/2/classes.html#getters--setters). Examples target TypeScript 5.9 with `strict: true` unless stated otherwise.
