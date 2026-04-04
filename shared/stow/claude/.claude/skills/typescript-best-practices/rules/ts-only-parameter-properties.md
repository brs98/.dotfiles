# parameter-properties

**When:** Defining class constructor parameters that should become instance properties.

## Bad
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

## Good
```typescript
class CanvasNode {
  constructor(private x: number, private y: number) {}
}
```

## Why
Parameter properties reduce boilerplate by automatically creating and assigning instance properties from constructor parameters. Adding `public`, `private`, or `readonly` before a parameter makes it a class property.
