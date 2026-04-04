# as-const-deep-readonly

**When:** You need a deeply immutable constant with literal types preserved.

## Bad
```typescript
const colors = { primary: "#007bff", secondary: "#6c757d" };
// type: { primary: string; secondary: string } - widened
colors.primary = "#000"; // Allowed!
```

## Good
```typescript
const colors = { primary: "#007bff", secondary: "#6c757d" } as const;
// type: { readonly primary: "#007bff"; readonly secondary: "#6c757d" }
colors.primary = "#000"; // Error: Cannot assign to readonly property
```

## Why
`as const` creates a deeply readonly type with literal values preserved. All nested properties become readonly and all values retain their literal types.
