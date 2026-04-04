# same-name-type-and-value

**When:** You want a class-like API where the same name works as both a type and a value.

## Bad
```typescript
function createUser(name: string) { return { name, id: crypto.randomUUID() }; }
type UserType = ReturnType<typeof createUser>;
// Two different names - confusing API
```

## Good
```typescript
function User(name: string) { return { name, id: crypto.randomUUID() }; }
type User = ReturnType<typeof User>;
// Same name for both!

const user: User = User("Alice"); // Works as type and constructor
```

## Why
TypeScript allows a type and value to share the same name. This creates an API that feels like a class - the name works in type position and value position - without using the `class` keyword.
