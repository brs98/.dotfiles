# dts-for-javascript-not-types

**When:** Deciding between `.ts` and `.d.ts` files for type definitions.

## Bad
```typescript
// types.d.ts - using .d.ts for regular type definitions
export interface User {
  id: string;
  name: string;
}
// Works but unconventional
```

## Good
```typescript
// types.ts - use .ts for your own type definitions
export interface User {
  id: string;
  name: string;
}

// Use .d.ts only for:
// - Typing existing JavaScript files
// - Ambient declarations (globals, modules without types)
// - Generated declaration files from tsc
```

## Why
`.d.ts` files are for describing external code that already exists. Use regular `.ts` files for your own type definitions - they're easier to work with and don't have declaration file restrictions.
