# no-destructure-discriminated-union

**When:** You want to destructure a discriminated union in function parameters but get type errors.

## Bad
```typescript
type Shape = { kind: "circle"; radius: number } | { kind: "square"; sideLength: number };

function calculateArea({ kind, radius, sideLength }: Shape) {
  // Error: radius and sideLength don't exist on Shape
  if (kind === "circle") {
    return Math.PI * radius * radius;
  }
}
```

## Good
```typescript
function calculateArea(shape: Shape) {
  if (shape.kind === "circle") {
    return Math.PI * shape.radius * shape.radius;
  }
  return shape.sideLength * shape.sideLength;
}
```

## Why
Destructuring breaks the connection between the discriminant and other properties. TypeScript can only narrow when you access properties through the original object reference. Keep discriminated unions intact.
