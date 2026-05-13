# verbatim-module-syntax

**When:** Importing types and wanting predictable import/export behavior in compiled output.

## Bad
```typescript
// Without verbatimModuleSyntax
import { User } from './types';
// May or may not appear in output depending on usage
```

## Good
```typescript
// tsconfig.json: "verbatimModuleSyntax": true
import type { User } from './types'; // Completely removed from output
import { type User, someFunction } from './module'; // Only User removed
```

## Why
`verbatimModuleSyntax` forces explicit `import type` for type-only imports, making it clear which imports are erased at compile time. This prevents accidental side-effect imports and makes output predictable.
