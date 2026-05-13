# switch-statement-narrowing

**When:** You have a discriminated union with multiple cases to handle.

## Bad
```typescript
function calculateArea(shape: Shape) {
  if (shape.kind === "circle") {
    return Math.PI * shape.radius * shape.radius;
  } else if (shape.kind === "square") {
    return shape.sideLength * shape.sideLength;
  } else if (shape.kind === "triangle") {
    // Gets unwieldy with many cases
  }
}
```

## Good
```typescript
function calculateArea(shape: Shape) {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius * shape.radius;
    case "square":
      return shape.sideLength * shape.sideLength;
    case "triangle":
      return 0.5 * shape.base * shape.height;
  }
}
```

## Why
Switch statements provide cleaner syntax for multiple cases. TypeScript narrows the type in each case block. This pattern scales better than if-else chains for discriminated unions with many members.
