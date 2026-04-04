# dts-no-runtime-code

**When:** Creating or editing `.d.ts` declaration files.

## Bad
```typescript
// types.d.ts
export const API_URL = "https://api.example.com"; // Error: initializers not allowed
export function parse(input: string) {
  return JSON.parse(input); // Error: implementations not allowed
}
```

## Good
```typescript
// types.d.ts
export declare const API_URL: string;
export declare function parse(input: string): unknown;

// Implementation goes in .ts or .js files
```

## Why
Declaration files (`.d.ts`) describe types only - they cannot contain runtime code like variable initializers or function bodies. Use `declare` keyword for ambient declarations.
