# template-literal-combinations

**When:** You need all combinations of string literal unions.

## Bad
```typescript
type Size = "sm" | "md" | "lg";
type Color = "red" | "blue";
type ButtonClass = "sm-red" | "sm-blue" | "md-red" | "md-blue" | "lg-red" | "lg-blue";
// Manual, error-prone
```

## Good
```typescript
type Size = "sm" | "md" | "lg";
type Color = "red" | "blue";
type ButtonClass = `${Size}-${Color}`;
// "sm-red" | "sm-blue" | "md-red" | "md-blue" | "lg-red" | "lg-blue"
```

## Why
Template literal types automatically distribute over unions, generating all combinations. Add a color or size and all combinations update automatically.
