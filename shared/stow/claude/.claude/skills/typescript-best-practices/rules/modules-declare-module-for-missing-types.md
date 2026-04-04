# declare-module-for-missing-types

**When:** Importing a package that has no TypeScript types.

## Bad
```typescript
import { something } from 'untyped-package';
// Error: Could not find declaration file for module 'untyped-package'
```

## Good
```typescript
// untyped-package.d.ts
declare module 'untyped-package' {
  export function something(): void;
  export interface Config { timeout: number }
}

// Now import works with types
import { something, Config } from 'untyped-package';
```

## Why
`declare module 'name'` creates an ambient module declaration, providing types for packages that don't include their own. Add only the types you actually use.
