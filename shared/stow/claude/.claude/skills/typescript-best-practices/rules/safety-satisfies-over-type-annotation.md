# satisfies-over-type-annotation

**When:** You want type validation but also need TypeScript to infer specific property types.

## Bad
```typescript
const config: Record<string, string> = {
  apiUrl: "https://api.example.com",
  env: "production"
};
config.apiUrl; // type: string (lost the literal)
config.typo; // No error! Any string key allowed
```

## Good
```typescript
const config = {
  apiUrl: "https://api.example.com",
  env: "production"
} satisfies Record<string, string>;
config.apiUrl; // type: "https://api.example.com" (literal preserved)
config.typo; // Error: Property 'typo' does not exist
```

## Why
Type annotations widen to the annotated type. `satisfies` validates against a type while preserving the inferred narrower type, giving you both safety and precision.
