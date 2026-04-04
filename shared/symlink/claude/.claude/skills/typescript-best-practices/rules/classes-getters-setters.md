# getters-setters

**When:** You need computed properties or controlled access to internal state.

## Bad
```typescript
class Rectangle {
  width: number;
  height: number;

  getArea() { return this.width * this.height; }
}
const rect = new Rectangle();
rect.getArea(); // Must call as method
```

## Good
```typescript
class Rectangle {
  constructor(public width: number, public height: number) {}

  get area() { return this.width * this.height; }

  set dimensions({ w, h }: { w: number; h: number }) {
    this.width = w;
    this.height = h;
  }
}
const rect = new Rectangle(10, 5);
rect.area; // 50 - accessed like a property
rect.dimensions = { w: 20, h: 10 };
```

## Why
Getters and setters provide property-like syntax for computed values and controlled mutations. They allow validation, lazy computation, and a cleaner API than explicit methods.
