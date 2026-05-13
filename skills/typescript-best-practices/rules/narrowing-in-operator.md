# in-operator-narrowing

**When:** You need to check if a property exists on an object to narrow a union of object types.

## Bad
```typescript
type APIResponse = { data: { id: string } } | { error: string };

function handle(response: APIResponse) {
  return response.data.id; // Error: data doesn't exist on error branch
}
```

## Good
```typescript
type APIResponse = { data: { id: string } } | { error: string };

function handle(response: APIResponse) {
  if ("data" in response) {
    return response.data.id; // response has data
  }
  throw new Error(response.error); // response has error
}
```

## Why
The `in` operator checks for property existence and narrows the type to only union members that have that property. Useful when object types don't share a common discriminant field.
