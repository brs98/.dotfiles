# discriminated-unions

**When:** You have multiple related object types that share a common property but have different shapes.

## Bad
```typescript
type Shape = {
  kind: string;
  radius?: number;
  sideLength?: number;
};

function calculateArea(shape: Shape) {
  if (shape.kind === "circle") {
    return Math.PI * shape.radius * shape.radius; // Error: radius possibly undefined
  }
}
```

## Good
```typescript
type Circle = { kind: "circle"; radius: number };
type Square = { kind: "square"; sideLength: number };
type Shape = Circle | Square;

function calculateArea(shape: Shape) {
  if (shape.kind === "circle") {
    return Math.PI * shape.radius * shape.radius; // radius is number
  }
  return shape.sideLength * shape.sideLength;
}
```

## Why
Discriminated unions use a literal type discriminant (like `kind`) to let TypeScript narrow the union to a specific member. This eliminates optional properties and ensures type safety when accessing member-specific fields.
