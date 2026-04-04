# strict-omit

**When:** Using Omit and wanting TypeScript to catch invalid keys.

## Bad
```typescript
type User = { id: string; name: string; email: string };
type PublicUser = Omit<User, "emial">; // Typo! No error, email not omitted
```

## Good
```typescript
type StrictOmit<T, K extends keyof T> = Omit<T, K>;

type User = { id: string; name: string; email: string };
type PublicUser = StrictOmit<User, "emial">; // Error: "emial" not in keyof User
type PublicUser = StrictOmit<User, "email">; // Works correctly
```

## Why
Built-in `Omit` accepts any string key for flexibility with unions. Create `StrictOmit` with `K extends keyof T` constraint for typo protection on known types.
