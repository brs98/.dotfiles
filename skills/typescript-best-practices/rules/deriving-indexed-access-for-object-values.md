# indexed-access-for-object-values

**When:** You need the type of a specific property from an object type.

## Bad
```typescript
const config = { apiUrl: "https://api.example.com", timeout: 5000 } as const;
type ApiUrl = string; // Too wide, loses literal type
```

## Good
```typescript
const config = { apiUrl: "https://api.example.com", timeout: 5000 } as const;
type Config = typeof config;
type ApiUrl = Config["apiUrl"]; // "https://api.example.com" (literal)
type Timeout = Config["timeout"]; // 5000 (literal)
```

## Why
Indexed access `Type["key"]` extracts the exact type of a property. With `as const` objects, this preserves literal types rather than widening to `string` or `number`.
