# discriminated-tuples

**When:** You want to return success/error pairs from functions where the type of the second element depends on the first.

## Bad
```typescript
type ApiResponse = [string, User[] | string];

const [status, value] = await fetchData();
if (status === "success") {
  console.log(value); // value is still User[] | string
}
```

## Good
```typescript
type ApiResponse = ["success", User[]] | ["error", string];

const [status, value] = await fetchData();
if (status === "success") {
  console.log(value); // value is User[]
} else {
  console.error(value); // value is string
}
```

## Why
Discriminated unions work with tuples too. Use literal types in the first position to discriminate. TypeScript narrows both tuple elements when you check the discriminant position.
