# callback-scope-narrowing

**When:** You narrow a value but TypeScript loses the narrowing inside a callback function.

## Bad
```typescript
const findUsers = (searchParams: { name?: string }, users: User[]) => {
  if (searchParams.name) {
    return users.filter((user) =>
      user.name.includes(searchParams.name) // Error: name possibly undefined
    );
  }
  return users;
};
```

## Good
```typescript
const findUsers = (searchParams: { name?: string }, users: User[]) => {
  const { name } = searchParams;
  if (name) {
    return users.filter((user) =>
      user.name.includes(name) // name is string
    );
  }
  return users;
};
```

## Why
Narrowing doesn't persist into callback functions because TypeScript can't guarantee the value won't change. Extract the value to a const variable first - constants maintain their narrowed type across scopes.
