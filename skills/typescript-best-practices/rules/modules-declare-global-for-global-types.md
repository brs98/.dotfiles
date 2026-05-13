# declare-global-for-global-types

**When:** Adding global types from within a module file (file with imports/exports).

## Bad
```typescript
// utils.ts (module - has imports)
import { something } from './other';

interface GlobalUser { name: string } // Not global! Only in this module
```

## Good
```typescript
// utils.ts (module)
import { something } from './other';

declare global {
  interface GlobalUser { name: string }
  var DEBUG: boolean;
}

export {}; // Ensure this is a module
```

## Why
In modules, use `declare global { }` block to add to the global scope. Without this wrapper, declarations are module-scoped and won't be visible globally.
