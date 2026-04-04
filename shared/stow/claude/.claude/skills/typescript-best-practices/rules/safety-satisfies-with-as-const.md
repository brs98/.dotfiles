# satisfies-with-as-const

**When:** You need both type validation and immutability with literal types.

## Bad
```typescript
const routes: Record<string, string> = {
  home: "/",
  about: "/about"
};
// Loses autocomplete on keys, values widened to string
```

## Good
```typescript
const routes = {
  home: "/",
  about: "/about"
} as const satisfies Record<string, string>;

routes.home; // type: "/" (literal, readonly)
routes.typo; // Error: Property 'typo' does not exist
```

## Why
Combine `as const satisfies Type` to get the best of both: type validation from `satisfies` plus deep immutability and literal inference from `as const`.
