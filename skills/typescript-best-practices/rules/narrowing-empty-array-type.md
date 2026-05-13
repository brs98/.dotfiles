# empty-array-type

**When:** You initialize an empty array and get `never[]` type errors when pushing items.

## Bad
```typescript
const shoppingCart = {
  items: [], // inferred as never[]
};

shoppingCart.items.push("Apple"); // Error: string not assignable to never
```

## Good
```typescript
const shoppingCart = {
  items: [] as string[],
};

shoppingCart.items.push("Apple"); // Works

// Or with explicit type:
const shoppingCart: { items: string[] } = {
  items: [],
};
```

## Why
TypeScript infers empty arrays as `never[]` in object literals because it has no values to infer the type from. Explicitly annotate the array type or use a type assertion to specify what the array will contain.
