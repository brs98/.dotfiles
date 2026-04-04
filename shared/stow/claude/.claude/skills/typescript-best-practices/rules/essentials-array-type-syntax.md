# array-type-syntax

**When:** Declaring arrays, including arrays of objects.

## Bad
```typescript
type ShoppingCart = {
  userId: string;
  items: string; // Wrong - can't assign string[] to string
};

type Recipe = {
  ingredients: object[]; // Too loose - loses type information
};
```

## Good
```typescript
type ShoppingCart = {
  userId: string;
  items: string[];
};

// Arrays of objects with inline type
type Recipe = {
  ingredients: { name: string; quantity: string }[];
};

// Or with a separate type alias
type Ingredient = { name: string; quantity: string };
type Recipe = {
  ingredients: Ingredient[];
};
```

## Why
TypeScript needs explicit array notation (`Type[]` or `Array<Type>`) to understand you want a collection. For arrays of objects, define the shape inline or extract to a type alias.
