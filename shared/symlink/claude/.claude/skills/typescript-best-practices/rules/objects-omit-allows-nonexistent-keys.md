# omit-allows-nonexistent-keys

**When:** Using Omit and expecting TypeScript to catch typos.

## Bad
```typescript
type User = { id: string; name: string; email: string };
type PublicUser = Omit<User, "emial">; // Typo! No error, no autocomplete
// PublicUser still has email property
```

## Good
```typescript
type StrictOmit<T, K extends keyof T> = Omit<T, K>;

type User = { id: string; name: string; email: string };
type PublicUser = StrictOmit<User, "emial">; // Error: "emial" not in keyof User
```

## Why
Built-in Omit accepts any string as the second argument (loose by design for flexibility). Create a StrictOmit wrapper that constrains keys to `keyof T` for typo protection.
