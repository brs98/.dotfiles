# types-packages-for-untyped-libs

**When:** A package doesn't include TypeScript types.

## Bad
```typescript
import _ from 'lodash';
// Error: Could not find declaration file for module 'lodash'
// Writing your own types for a popular library
```

## Good
```bash
npm install --save-dev @types/lodash
```

```typescript
import _ from 'lodash'; // Now typed via @types/lodash
```

## Why
Check DefinitelyTyped (`@types/*`) before writing your own declarations. Most popular libraries have community-maintained types: `npm install --save-dev @types/package-name`.
