# type-alias-for-reuse

**When:** The same object type shape is used in multiple places.

## Bad
```typescript
// Duplicated type definitions
const getRectangleArea = (rectangle: { width: number; height: number }) => {
  return rectangle.width * rectangle.height;
};

const getRectanglePerimeter = (rectangle: { width: number; height: number }) => {
  return 2 * (rectangle.width + rectangle.height);
};
```

## Good
```typescript
// Single source of truth with type alias
type Rectangle = {
  width: number;
  height: number;
};

const getRectangleArea = (rectangle: Rectangle) => {
  return rectangle.width * rectangle.height;
};

const getRectanglePerimeter = (rectangle: Rectangle) => {
  return 2 * (rectangle.width + rectangle.height);
};
```

## Why
Using a type alias creates a single source of truth. When you need to modify properties, you only change one place instead of hunting through every usage.
