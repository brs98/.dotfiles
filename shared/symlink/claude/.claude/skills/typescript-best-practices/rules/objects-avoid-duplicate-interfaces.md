# avoid-duplicate-interfaces

**When:** You see the same interface name declared multiple times.

## Bad
```typescript
interface User { name: string }
interface User { email: string }
// Silently merges! User now requires BOTH properties
const user: User = { name: "Alice" }; // Error: missing email
```

## Good
```typescript
interface User {
  name: string;
  email: string;
}
// Single declaration, clear requirements
```

## Why
Duplicate interfaces automatically merge (declaration merging), causing unexpected type requirements. This feature exists for augmenting third-party types but is confusing when unintentional.
