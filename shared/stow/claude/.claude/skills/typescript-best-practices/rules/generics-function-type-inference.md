# function-type-inference

**When:** Writing generic functions where the type should be inferred from arguments.

## Bad
```typescript
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}
const item = first<string>(["a", "b"]); // Explicit type argument unnecessary
```

## Good
```typescript
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}
const item = first(["a", "b"]); // T inferred as string
const num = first([1, 2, 3]); // T inferred as number
```

## Why
Generic function type parameters are inferred from arguments. Only provide explicit type arguments when inference fails or you need a wider/different type than inferred.
