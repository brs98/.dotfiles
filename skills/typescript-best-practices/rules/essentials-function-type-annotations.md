# function-type-annotations

**When:** A function accepts another function as a parameter (callbacks, handlers).

## Bad
```typescript
const modifyUser = (users: User[], id: string, makeChange) => {
  // Error: Parameter 'makeChange' implicitly has an 'any' type
  return users.map((u) => (u.id === id ? makeChange(u) : u));
};
```

## Good
```typescript
// Function type: (params) => returnType
const modifyUser = (
  users: User[],
  id: string,
  makeChange: (user: User) => User
) => {
  return users.map((u) => (u.id === id ? makeChange(u) : u));
};

// Void return for callbacks that don't return anything
const onClick = (handler: () => void) => {
  document.addEventListener("click", handler);
};
```

## Why
Function types use arrow syntax `(param: Type) => ReturnType`. Use `void` for functions that should not return anything. This enables TypeScript to check both parameters and return value.
