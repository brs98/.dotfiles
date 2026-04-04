# typing-json-parse

**When:** Using `JSON.parse()` or `response.json()` which return `any`.

## Bad
```typescript
// JSON.parse doesn't accept type arguments
const data = JSON.parse<User>('{"name": "Alice"}');
// Error: Expected 0 type arguments, but got 1

// Result is typed as 'any' - no safety
const data = JSON.parse('{"name": "Alice"}');
data.whatever; // No error - any allows anything
```

## Good
```typescript
// Use type assertion with 'as'
const data = JSON.parse('{"name": "Alice"}') as User;

// Or assign to a typed variable
const data: User = JSON.parse('{"name": "Alice"}');

// Same for fetch response.json()
const response = await fetch("/api/user");
const user = await response.json() as User;
```

## Why
`JSON.parse()` returns `any` because TypeScript cannot know the shape at compile time. Use type assertions or explicit variable typing to tell TypeScript what to expect.
